import { createSign } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_DRIVE_FOLDER_ID = "1C_LqSgRMcvqpzo-_s2p2AjS9gaSvVOJg";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_PHOTOS = 20;
const MAX_BYTES = 30 * 1024 * 1024;
const PALETTE = ["#7EC8E3", "#F6D56B", "#8FCB9B"];

export class DriveError extends Error {
  constructor(message) {
    super(message);
    this.name = "DriveError";
  }
}

function isRealDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseWeekFolderName(name) {
  const match = /^(\d{4})(\d{2})(\d{2})_(.+)$/.exec(String(name || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const title = match[4].trim();
  if (!title || /[\u0000-\u001f]/.test(title)) return null;
  if ([...title].length > 40) return { error: "long" };
  if (!isRealDate(year, month, day)) return null;
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    title,
  };
}

export function parseServiceAccount(jsonText) {
  let data;
  try {
    data = JSON.parse(String(jsonText || "").replace(/^\uFEFF/, ""));
  } catch {
    throw new DriveError("DRIVE_SERVICE_ACCOUNT_JSON 唔係有效嘅 JSON。請貼成個服務帳戶檔案，今次不會發佈。");
  }
  const clientEmail = data?.client_email;
  const privateKey = data?.private_key;
  if (
    typeof clientEmail !== "string"
    || !clientEmail.includes("@")
    || typeof privateKey !== "string"
    || !privateKey.includes("PRIVATE KEY")
  ) {
    throw new DriveError("DRIVE_SERVICE_ACCOUNT_JSON 缺少服務帳戶電郵或者密鑰。今次不會發佈。");
  }
  return { clientEmail, privateKey };
}

function loopbackOrDefault(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new DriveError("Drive 測試網址格式唔啱。今次不會發佈。");
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new DriveError("Drive 測試網址只可以係本機。今次不會發佈。");
  }
  return raw.replace(/\/$/, "");
}

export function driveSettings(env = process.env) {
  const folderId = String(env.DRIVE_FOLDER_ID || "").trim() || DEFAULT_DRIVE_FOLDER_ID;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(folderId)) {
    throw new DriveError("Drive 資料夾編號格式唔啱。今次不會發佈。");
  }
  return {
    folderId,
    tokenUrl: loopbackOrDefault(env.DRIVE_TOKEN_URL, TOKEN_AUDIENCE),
    apiUrl: loopbackOrDefault(env.DRIVE_API_URL, "https://www.googleapis.com/drive/v3"),
  };
}

function signJwt({ clientEmail, privateKey, now }) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const issued = Math.floor(now / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: DRIVE_SCOPE,
    aud: TOKEN_AUDIENCE,
    iat: issued,
    exp: issued + 3600,
  })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
}

async function request(fetchImpl, url, options) {
  try {
    return await fetchImpl(url, { ...options, signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new DriveError("連唔到 Google Drive。今次不會發佈。");
  }
}

async function accessToken({ account, tokenUrl, fetchImpl, now }) {
  const response = await request(fetchImpl, tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signJwt({ ...account, now }),
    }),
  });
  if (!response.ok) {
    throw new DriveError("Google 登入服務帳戶失敗。請檢查 secret 係成個 JSON 檔，而且已啟用 Google Drive API。今次不會發佈。");
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new DriveError("Google 登入服務帳戶失敗。今次不會發佈。");
  }
  if (!body?.access_token || typeof body.access_token !== "string") {
    throw new DriveError("Google 登入服務帳戶失敗。今次不會發佈。");
  }
  return body.access_token;
}

async function listChildren({ apiUrl, token, parentId, fetchImpl }) {
  const files = [];
  let pageToken = "";
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`${apiUrl}/files`);
    url.searchParams.set("q", `'${parentId}' in parents and trashed = false`);
    url.searchParams.set("fields", "nextPageToken, files(id, name, mimeType, size)");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await request(fetchImpl, url, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403) {
      throw new DriveError("讀唔到 Google Drive 資料夾。請檢查服務帳戶已獲分享（檢視者），而且已啟用 Google Drive API。今次不會發佈。");
    }
    if (!response.ok) throw new DriveError("讀取 Google Drive 失敗。今次不會發佈。");
    let body;
    try {
      body = await response.json();
    } catch {
      throw new DriveError("讀取 Google Drive 失敗。今次不會發佈。");
    }
    for (const file of body.files || []) files.push(file);
    if (!body.nextPageToken) return files;
    if (typeof body.nextPageToken !== "string" || body.nextPageToken.length > 512) {
      throw new DriveError("讀取 Google Drive 失敗。今次不會發佈。");
    }
    pageToken = body.nextPageToken;
  }
  throw new DriveError("Google Drive 檔案太多，今次不會發佈。");
}

function isJpegName(name) {
  return /\.jpe?g$/i.test(String(name || ""));
}

function looksLikeJpeg(file) {
  const mime = String(file.mimeType || "");
  if (mime === FOLDER_MIME || mime.startsWith("application/vnd.google-apps.")) return false;
  if (mime === "image/jpeg") return true;
  if ((mime === "application/octet-stream" || mime === "") && isJpegName(file.name)) return true;
  return false;
}

async function downloadFile({ apiUrl, token, fileId, fetchImpl }) {
  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) {
    throw new DriveError("讀取 Google Drive 失敗。今次不會發佈。");
  }
  const url = new URL(`${apiUrl}/files/${fileId}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await request(fetchImpl, url, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) {
    throw new DriveError("讀唔到 Google Drive 嘅相片。請檢查資料夾已分享俾服務帳戶（檢視者）。今次不會發佈。");
  }
  if (!response.ok) throw new DriveError("下載 Google Drive 相片失敗。今次不會發佈。");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) {
    throw new DriveError("有一張相片大過 30MB。請喺 Drive 入面換細張，今次不會發佈。");
  }
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  return bytes;
}

export async function importDriveWeeks({
  jsonText,
  destDir,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  env = process.env,
}) {
  const account = parseServiceAccount(jsonText);
  const { folderId, tokenUrl, apiUrl } = driveSettings(env);
  const token = await accessToken({ account, tokenUrl, fetchImpl, now });
  const rootEntries = await listChildren({ apiUrl, token, parentId: folderId, fetchImpl });
  const weeks = [];
  const seen = new Set();
  for (const entry of rootEntries) {
    if (entry.mimeType !== FOLDER_MIME) continue;
    const parsed = parseWeekFolderName(entry.name);
    if (parsed?.error === "long") {
      throw new DriveError("有一個活動名稱太長。請改短個資料夾名稱，今次不會發佈。");
    }
    if (!parsed?.date || !/^[A-Za-z0-9_-]+$/.test(String(entry.id || ""))) continue;
    if (seen.has(parsed.date)) {
      throw new DriveError("有兩個週次用咗同一個日期。今次不會發佈。");
    }
    seen.add(parsed.date);
    weeks.push({ ...parsed, id: entry.id });
  }
  if (!weeks.length) {
    throw new DriveError("Drive 資料夾入面搵唔到符合日期_活動名稱嘅週次。今次不會發佈。");
  }

  let photos = 0;
  let used = 0;
  let capped = false;
  const weeksDir = path.join(destDir, "weeks");

  for (const week of weeks) {
    const children = await listChildren({ apiUrl, token, parentId: week.id, fetchImpl });
    const candidates = children
      .filter((file) => looksLikeJpeg(file) && /^[A-Za-z0-9_-]+$/.test(String(file.id || "")))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "en", { numeric: true, sensitivity: "base" }));
    if (candidates.length > MAX_PHOTOS) capped = true;
    const chosen = candidates.slice(0, MAX_PHOTOS);
    const downloaded = [];
    for (const file of chosen) {
      const size = Number(file.size || 0);
      if (size > MAX_BYTES) {
        throw new DriveError("有一張相片大過 30MB。請喺 Drive 入面換細張，今次不會發佈。");
      }
      const bytes = await downloadFile({ apiUrl, token, fileId: file.id, fetchImpl });
      if (!bytes) continue;
      downloaded.push(bytes);
    }
    if (!downloaded.length) continue;
    const photoDir = path.join(weeksDir, week.date, "photos");
    await mkdir(photoDir, { recursive: true });
    const saved = downloaded.map((bytes, index) => {
      const filename = `${String(index + 1).padStart(2, "0")}.jpg`;
      return { filename, bytes, caption: `活動相片 ${index + 1}` };
    });
    await Promise.all(saved.map((photo) => writeFile(path.join(photoDir, photo.filename), photo.bytes)));
    const colorIndex = Number(week.date.replaceAll("-", "")) % PALETTE.length;
    const weekJson = {
      date: week.date,
      title: week.title,
      themeColor: PALETTE[colorIndex],
      photos: saved.map((photo) => ({ file: photo.filename, caption: photo.caption })),
    };
    await writeFile(path.join(weeksDir, week.date, "week.json"), `${JSON.stringify(weekJson, null, 2)}\n`, "utf8");
    photos += saved.length;
    used += 1;
  }

  if (!used) {
    throw new DriveError("Drive 週次入面搵唔到 JPEG 相片。今次不會發佈。");
  }
  return { weeks: used, photos, capped };
}
