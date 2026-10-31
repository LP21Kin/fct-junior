import { createSign } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isVideoContainer } from "./compress.mjs";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_PHOTOS = 60;
const MAX_VIDEOS = 2;
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const PHOTO_TOO_BIG = "有一張相片大過 30MB。請喺 Drive 入面換細張，今次不會發佈。";
const VIDEO_TOO_BIG = "有一段影片大過 80MB。請剪短或者壓細，今次不會發佈。";
const PALETTE = ["#7EC8E3", "#F6D56B", "#8FCB9B"];
const VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"]);

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
  const folderId = String(env.DRIVE_FOLDER_ID ?? "").trim();
  if (!folderId) {
    throw new DriveError("未設定 DRIVE_FOLDER_ID。Kin 要喺 GitHub Actions 加入 secret DRIVE_FOLDER_ID（Drive 父資料夾編號）。今次不會發佈。");
  }
  if (!/^[A-Za-z0-9_-]{10,}$/.test(folderId)) {
    throw new DriveError("DRIVE_FOLDER_ID 格式唔啱。Kin 要喺 GitHub Actions secret DRIVE_FOLDER_ID 填正確嘅 Drive 父資料夾編號。今次不會發佈。");
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

function isVideoName(name) {
  return /\.(mp4|m4v|mov|webm)$/i.test(String(name || ""));
}

function looksLikeVideo(file) {
  const mime = String(file.mimeType || "");
  if (mime === FOLDER_MIME || mime.startsWith("application/vnd.google-apps.")) return false;
  if (looksLikeJpeg(file)) return false;
  if (VIDEO_MIME.has(mime)) return true;
  if ((mime === "application/octet-stream" || mime === "") && isVideoName(file.name)) return true;
  return false;
}

function byName(a, b) {
  return String(a.name).localeCompare(String(b.name), "en", { numeric: true, sensitivity: "base" });
}

export function isJpeg(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function isDriveFolder(file) {
  return file?.mimeType === FOLDER_MIME;
}

export function isDriveJpeg(file) {
  return looksLikeJpeg(file);
}

function videoExtension(bytes, originalName) {
  const lower = String(originalName || "").toLowerCase();
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  if (lower.endsWith(".mov")) return "mov";
  if (lower.endsWith(".m4v")) return "m4v";
  return "mp4";
}

async function downloadBytes({ apiUrl, token, fileId, fetchImpl, maxBytes, tooBigMessage }) {
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
    throw new DriveError("讀唔到 Google Drive 嘅相片或影片。請檢查資料夾已分享俾服務帳戶（檢視者）。今次不會發佈。");
  }
  if (!response.ok) throw new DriveError("下載 Google Drive 檔案失敗。今次不會發佈。");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new DriveError(tooBigMessage);
  return bytes;
}

export async function openDriveSession({
  jsonText,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  env = process.env,
}) {
  const account = parseServiceAccount(jsonText);
  const tokenUrl = loopbackOrDefault(env.DRIVE_TOKEN_URL, TOKEN_AUDIENCE);
  const apiUrl = loopbackOrDefault(env.DRIVE_API_URL, "https://www.googleapis.com/drive/v3");
  const token = await accessToken({ account, tokenUrl, fetchImpl, now });
  return { apiUrl, token, fetchImpl };
}

export async function listDriveChildren(session, parentId) {
  return listChildren({
    apiUrl: session.apiUrl,
    token: session.token,
    parentId,
    fetchImpl: session.fetchImpl,
  });
}

export async function downloadDriveFile(session, fileId, maxBytes) {
  return downloadBytes({
    apiUrl: session.apiUrl,
    token: session.token,
    fileId,
    fetchImpl: session.fetchImpl,
    maxBytes,
    tooBigMessage: "有一張週會活動表或事奉人員圖片太大。今次不會嵌呢張圖。",
  });
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
  let videos = 0;
  let used = 0;
  let capped = false;
  let videosCapped = false;
  const weeksDir = path.join(destDir, "weeks");

  for (const week of weeks) {
    const children = await listChildren({ apiUrl, token, parentId: week.id, fetchImpl });
    const named = children.filter((file) => /^[A-Za-z0-9_-]+$/.test(String(file.id || "")));
    const photoCandidates = named.filter(looksLikeJpeg).sort(byName);
    const videoCandidates = named.filter(looksLikeVideo).sort(byName);
    if (photoCandidates.length > MAX_PHOTOS) capped = true;
    if (videoCandidates.length > MAX_VIDEOS) videosCapped = true;
    const chosenPhotos = photoCandidates.slice(0, MAX_PHOTOS);
    const chosenVideos = videoCandidates.slice(0, MAX_VIDEOS);
    const downloadedPhotos = [];
    for (const file of chosenPhotos) {
      const size = Number(file.size || 0);
      if (size > MAX_BYTES) throw new DriveError(PHOTO_TOO_BIG);
      const bytes = await downloadBytes({
        apiUrl, token, fileId: file.id, fetchImpl, maxBytes: MAX_BYTES, tooBigMessage: PHOTO_TOO_BIG,
      });
      if (!isJpeg(bytes)) continue;
      downloadedPhotos.push(bytes);
    }
    const downloadedVideos = [];
    for (const file of chosenVideos) {
      const size = Number(file.size || 0);
      if (size > MAX_VIDEO_BYTES) throw new DriveError(VIDEO_TOO_BIG);
      const bytes = await downloadBytes({
        apiUrl, token, fileId: file.id, fetchImpl, maxBytes: MAX_VIDEO_BYTES, tooBigMessage: VIDEO_TOO_BIG,
      });
      if (!isVideoContainer(bytes)) continue;
      downloadedVideos.push({ bytes, name: file.name });
    }
    if (!downloadedPhotos.length && !downloadedVideos.length) continue;
    const photoDir = path.join(weeksDir, week.date, "photos");
    const videoDir = path.join(weeksDir, week.date, "videos");
    if (downloadedPhotos.length) await mkdir(photoDir, { recursive: true });
    if (downloadedVideos.length) await mkdir(videoDir, { recursive: true });
    const savedPhotos = downloadedPhotos.map((bytes, index) => {
      const filename = `${String(index + 1).padStart(2, "0")}.jpg`;
      return { filename, bytes, caption: `活動相片 ${index + 1}` };
    });
    const savedVideos = downloadedVideos.map((item, index) => {
      const filename = `v${String(index + 1).padStart(2, "0")}.${videoExtension(item.bytes, item.name)}`;
      return { filename, bytes: item.bytes, caption: `活動影片 ${index + 1}` };
    });
    await Promise.all([
      ...savedPhotos.map((photo) => writeFile(path.join(photoDir, photo.filename), photo.bytes)),
      ...savedVideos.map((video) => writeFile(path.join(videoDir, video.filename), video.bytes)),
    ]);
    const colorIndex = Number(week.date.replaceAll("-", "")) % PALETTE.length;
    const weekJson = {
      date: week.date,
      title: week.title,
      themeColor: PALETTE[colorIndex],
      photos: savedPhotos.map((photo) => ({ file: photo.filename, caption: photo.caption })),
    };
    if (savedVideos.length) {
      weekJson.videos = savedVideos.map((video) => ({ file: video.filename, caption: video.caption }));
    }
    await writeFile(path.join(weeksDir, week.date, "week.json"), `${JSON.stringify(weekJson, null, 2)}\n`, "utf8");
    photos += savedPhotos.length;
    videos += savedVideos.length;
    used += 1;
  }

  if (!used) {
    throw new DriveError("Drive 週次入面搵唔到 JPEG 相片或者影片。今次不會發佈。");
  }
  return { weeks: used, photos, videos, capped, videosCapped };
}
