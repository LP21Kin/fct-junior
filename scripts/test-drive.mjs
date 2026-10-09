import { spawn } from "node:child_process";
import { createVerify, generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { DriveError, driveSettings, importDriveWeeks, parseWeekFolderName } from "./lib/drive.mjs";
import { compressPhoto } from "./lib/compress.mjs";
import { loadWeeks } from "./lib/weeks.mjs";
import { renderSite } from "./lib/render.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const email = "reader@example.iam.gserviceaccount.com";
const folderId = "fixtureFolder1";
const password = randomBytes(18).toString("base64url");
const keyMarker = ["BEGIN", "PRIVATE KEY"].join(" ");

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
const serviceAccount = JSON.stringify({
  type: "service_account",
  client_email: email,
  private_key: pem,
});

const tiny = await sharp({
  create: { width: 48, height: 36, channels: 3, background: { r: 186, g: 214, b: 196 } },
}).jpeg().toBuffer();
const marked = await sharp({
  create: { width: 640, height: 480, channels: 3, background: { r: 126, g: 184, b: 214 } },
}).jpeg().withMetadata({
  exif: { IFD0: { ImageDescription: "SECRET-LOCATION-MARKER" } },
}).toBuffer();
assert(marked.includes(Buffer.from("SECRET-LOCATION-MARKER")), "測試圖未有隱藏標記。");

const compressed = await compressPhoto(marked, "01.jpg");
assert(!compressed.buffer.includes(Buffer.from("SECRET-LOCATION-MARKER")), "壓縮後仍有隱藏標記。");
const meta = await sharp(compressed.buffer).metadata();
assert(!meta.exif, "壓縮後仍有 EXIF。");

assert(parseWeekFolderName("20260919_測試手工")?.date === "2026-09-19", "資料夾日期解錯。");
assert(parseWeekFolderName("20260919_測試手工")?.title === "測試手工", "資料夾標題解錯。");
assert(parseWeekFolderName("20260231_唔啱") === null, "無效日期不應接受。");
assert(parseWeekFolderName("notes") === null, "普通資料夾不應當成週次。");

function assertFolderSecretRejected(env, includes) {
  let failed = false;
  try {
    driveSettings(env);
  } catch (error) {
    failed = error instanceof DriveError
      && error.message.includes(includes)
      && error.message.includes("Kin")
      && error.message.includes("secret DRIVE_FOLDER_ID")
      && error.message.includes("不會發佈");
  }
  assert(failed, `DRIVE_FOLDER_ID（${includes}）應停止發佈。`);
}

assertFolderSecretRejected({}, "未設定 DRIVE_FOLDER_ID");
assertFolderSecretRejected({ DRIVE_FOLDER_ID: "" }, "未設定 DRIVE_FOLDER_ID");
assertFolderSecretRejected({ DRIVE_FOLDER_ID: "   " }, "未設定 DRIVE_FOLDER_ID");
assertFolderSecretRejected({ DRIVE_FOLDER_ID: "short" }, "格式唔啱");
assertFolderSecretRejected({ DRIVE_FOLDER_ID: "not a folder" }, "格式唔啱");
const trimmed = driveSettings({ DRIVE_FOLDER_ID: `  ${folderId}  ` });
assert(trimmed.folderId === folderId, "DRIVE_FOLDER_ID 應去掉前後空白。");
assert(trimmed.tokenUrl === "https://oauth2.googleapis.com/token", "未改 Drive 登入網址。");
assert(trimmed.apiUrl === "https://www.googleapis.com/drive/v3", "未改 Drive API 網址。");

function filesFor(mode) {
  const files = [
    { id: "weekCraft001", parent: folderId, name: "20260919_測試手工", mimeType: "application/vnd.google-apps.folder" },
    { id: "weekRainbow1", parent: folderId, name: "20261004_測試彩虹", mimeType: "application/vnd.google-apps.folder" },
    { id: "weekEmpty001", parent: folderId, name: "20260801_只有圖示", mimeType: "application/vnd.google-apps.folder" },
    { id: "weekBadDate1", parent: folderId, name: "20261340_唔啱日期", mimeType: "application/vnd.google-apps.folder" },
    { id: "weekNotes001", parent: folderId, name: "hello", mimeType: "application/vnd.google-apps.folder" },
    { id: "looseJpeg01", parent: folderId, name: "random.jpg", mimeType: "image/jpeg", bytes: tiny },
    { id: "pngOnly0001", parent: "weekEmpty001", name: "icon.png", mimeType: "image/png", bytes: Buffer.from("png") },
    { id: "rainbowJpeg1", parent: "weekRainbow1", name: "plain.jpg", mimeType: "image/jpeg", bytes: marked },
    { id: "rainbowFake01", parent: "weekRainbow1", name: "wrong.jpg", mimeType: "image/jpeg", bytes: Buffer.from("not a photo") },
    { id: "rainbowPng001", parent: "weekRainbow1", name: "notes.png", mimeType: "image/png", bytes: Buffer.from("png") },
  ];
  if (mode === "long") {
    files.push({
      id: "weekLongTitle",
      parent: folderId,
      name: `20260101_${"很".repeat(41)}`,
      mimeType: "application/vnd.google-apps.folder",
    });
  }
  if (mode === "huge") {
    files.push({
      id: "hugeJpeg0001",
      parent: "weekRainbow1",
      name: "big.jpg",
      mimeType: "image/jpeg",
      size: 40 * 1024 * 1024,
      bytes: tiny,
    });
  }
  for (let index = 1; index <= 22; index += 1) {
    files.push({
      id: `shot${String(index).padStart(2, "0")}`,
      parent: "weekCraft001",
      name: `shot-${String(index).padStart(2, "0")}.jpg`,
      mimeType: "image/jpeg",
      bytes: tiny,
    });
  }
  return files;
}

function startServer(mode) {
  const files = filesFor(mode);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "POST" && url.pathname === "/token") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      const parts = (params.get("assertion") || "").split(".");
      let ok = parts.length === 3;
      if (ok) {
        const verify = createVerify("RSA-SHA256");
        verify.update(`${parts[0]}.${parts[1]}`);
        verify.end();
        ok = verify.verify(publicKey, Buffer.from(parts[2], "base64url"));
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        ok = ok && payload.scope === "https://www.googleapis.com/auth/drive.readonly" && payload.iss === email;
      }
      res.writeHead(ok ? 200 : 401, { "content-type": "application/json" });
      res.end(ok ? JSON.stringify({ access_token: "fixture-token" }) : "{}");
      return;
    }
    if ((req.headers.authorization || "") !== "Bearer fixture-token") {
      res.writeHead(401);
      res.end();
      return;
    }
    if (mode === "deny") {
      res.writeHead(403, { "content-type": "application/json" });
      res.end("{}");
      return;
    }
    if (req.method === "GET" && url.pathname === "/drive/v3/files") {
      const parent = (url.searchParams.get("q") || "").match(/'([^']+)'/)?.[1];
      const list = files.filter((file) => file.parent === parent);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        files: list.map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: String(file.size || file.bytes?.length || 0),
        })),
      }));
      return;
    }
    const media = url.pathname.match(/^\/drive\/v3\/files\/([A-Za-z0-9_-]+)$/);
    if (req.method === "GET" && media && url.searchParams.get("alt") === "media") {
      const file = files.find((item) => item.id === media[1]);
      if (!file?.bytes) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "image/jpeg" });
      res.end(file.bytes);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        tokenUrl: `http://127.0.0.1:${port}/token`,
        apiUrl: `http://127.0.0.1:${port}/drive/v3`,
      });
    });
  });
}

function runBuild(extraEnv) {
  const env = { ...process.env, ...extraEnv };
  delete env.CONTENT_REPO;
  delete env.CONTENT_READ_TOKEN;
  delete env.STATICRYPT_PASSWORD;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/build.mjs"], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function outputIsClean(text) {
  return !text.includes(keyMarker)
    && !text.includes(email)
    && !text.includes("fixture-token")
    && !text.includes("shot-")
    && !text.includes("plain.jpg")
    && !text.includes("SECRET-LOCATION-MARKER")
    && !text.includes("測試手工")
    && !text.includes(password)
    && !text.includes(pem);
}

const libraryDir = await mkdtemp(path.join(tmpdir(), "fct-drive-lib-"));
const server = await startServer("ok");
try {
  const summary = await importDriveWeeks({
    jsonText: serviceAccount,
    destDir: libraryDir,
    env: {
      DRIVE_FOLDER_ID: folderId,
      DRIVE_TOKEN_URL: server.tokenUrl,
      DRIVE_API_URL: server.apiUrl,
    },
  });
  assert(summary.weeks === 2, "週次數量不對。");
  assert(summary.photos === 21, "相片數量不對。");
  assert(summary.capped, "多過 20 張時應有上限。");
  const craftJson = await readFile(path.join(libraryDir, "weeks", "2026-09-19", "week.json"), "utf8");
  assert(!craftJson.includes("shot-"), "week.json 不應有原本檔名。");
  assert(craftJson.includes("活動相片 20"), "說明應係活動相片編號。");
  assert(!craftJson.includes("活動相片 21"), "不應使用第 21 張。");
  assert(!craftJson.includes("memoryVerse"), "Drive 週次不應捏造金句。");
  const names = await readdir(path.join(libraryDir, "weeks", "2026-09-19", "photos"));
  assert(names.length === 20 && names.every((name) => /^\d{2}\.jpg$/.test(name)), "相片應改成編號檔名。");
  assert(!(await readdir(path.join(libraryDir, "weeks"))).includes("2026-08-01"), "沒有 JPEG 的週次不應留下。");
  const weeks = await loadWeeks(libraryDir, { drive: true });
  assert(weeks[0].title === "測試彩虹" && weeks[0].memoryVerse === "" && weeks[0].points.length === 0, "最新一週應只顯示活動名稱。");
  const rendered = await renderSite({ root, weeks, demoMode: false });
  assert(rendered.html.includes("測試彩虹"), "頁面應顯示活動名稱。");
  assert(rendered.html.includes("活動相片 1"), "頁面應有編號說明。");
  assert(!rendered.html.includes('class="verse-label">金句</figcaption>'), "沒有每週金句時不應顯示。");
  assert(!rendered.html.includes(">重點<"), "沒有重點時不應顯示。");
  assert(rendered.html.includes("溫馨提示"), "解鎖後應有溫馨提示。");
  assert(rendered.html.includes("呢度只畀初級團家長睇 💛 私人小天地，唔對外公開；請大家唔好轉發，一齊保護小朋友🙏🏻"), "溫馨提示正文不對。");
  assert(rendered.html.includes("團契金句"), "常設團契金句應顯示。");
  assert(rendered.html.includes("小小門徒・大大榜樣"), "團契金句引導語不對。");
  assert(rendered.html.includes("「不可叫人小看你年輕，總要在言語、行為、愛心、信心、清潔上，都作信徒的榜樣。」— 提摩太前書 4:12"), "團契金句經文不對。");
  assert(rendered.strings.includes("團契金句") && rendered.strings.includes("溫馨提示"), "明文清單應包括新文案。");
  assert(!rendered.html.includes("shot-") && !rendered.html.includes("plain.jpg"), "頁面不應有原本檔名。");
  assert(!rendered.html.includes("SECRET-LOCATION-MARKER"), "頁面不應有隱藏位置資料。");
} finally {
  await new Promise((resolve) => server.server.close(resolve));
  await rm(libraryDir, { recursive: true, force: true });
}

async function expectDriveFailure(mode, includes) {
  const local = await startServer(mode);
  const dir = await mkdtemp(path.join(tmpdir(), "fct-drive-fail-"));
  try {
    const result = await runBuild({
      SITE_PASSWORD: password,
      DRIVE_SERVICE_ACCOUNT_JSON: mode === "bad-json" ? "{" : serviceAccount,
      DRIVE_FOLDER_ID: folderId,
      DRIVE_TOKEN_URL: local.tokenUrl,
      DRIVE_API_URL: local.apiUrl,
      OUTPUT_DIR: path.join(dir, "dist"),
      BUILD_DIR: path.join(dir, "build"),
      CONTENT_DIR: path.join(dir, "content"),
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.status !== 0, `${mode} 不應發佈成功。`);
    assert(output.includes(includes), `${mode} 錯誤訊息不對。`);
    assert(outputIsClean(output), `${mode} 輸出洩漏了秘密或檔名。`);
    let published = false;
    try {
      await readFile(path.join(dir, "dist", "index.html"));
      published = true;
    } catch {
      published = false;
    }
    assert(!published, `${mode} 不應寫出網頁。`);
  } finally {
    await new Promise((resolve) => local.server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
}

const longServer = await startServer("long");
const longDir = await mkdtemp(path.join(tmpdir(), "fct-drive-long-"));
try {
  let failed = false;
  try {
    await importDriveWeeks({
      jsonText: serviceAccount,
      destDir: longDir,
      env: { DRIVE_FOLDER_ID: folderId, DRIVE_TOKEN_URL: longServer.tokenUrl, DRIVE_API_URL: longServer.apiUrl },
    });
  } catch (error) {
    failed = error.message.includes("活動名稱太長");
  }
  assert(failed, "太長的活動名稱應停止。");
} finally {
  await new Promise((resolve) => longServer.server.close(resolve));
  await rm(longDir, { recursive: true, force: true });
}

const hugeServer = await startServer("huge");
const hugeDir = await mkdtemp(path.join(tmpdir(), "fct-drive-huge-"));
try {
  let failed = false;
  try {
    await importDriveWeeks({
      jsonText: serviceAccount,
      destDir: hugeDir,
      env: { DRIVE_FOLDER_ID: folderId, DRIVE_TOKEN_URL: hugeServer.tokenUrl, DRIVE_API_URL: hugeServer.apiUrl },
    });
  } catch (error) {
    failed = error.message.includes("30MB");
  }
  assert(failed, "過大的相片應停止。");
} finally {
  await new Promise((resolve) => hugeServer.server.close(resolve));
  await rm(hugeDir, { recursive: true, force: true });
}

const okServer = await startServer("ok");
const buildDir = await mkdtemp(path.join(tmpdir(), "fct-drive-build-"));
try {
  const result = await runBuild({
    SITE_PASSWORD: password,
    DRIVE_SERVICE_ACCOUNT_JSON: serviceAccount,
    DRIVE_FOLDER_ID: folderId,
    DRIVE_TOKEN_URL: okServer.tokenUrl,
    DRIVE_API_URL: okServer.apiUrl,
    OUTPUT_DIR: path.join(buildDir, "dist"),
    BUILD_DIR: path.join(buildDir, "build"),
    CONTENT_DIR: path.join(buildDir, "content"),
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status !== 0) {
    console.error(output.split(pem).join("[已隱藏]").split(password).join("[已隱藏]"));
    process.exit(1);
  }
  assert(output.includes("已從 Google Drive 讀取 2 個週次、21 張相片。"), "成功訊息不對。");
  assert(output.includes("只用咗 20 張"), "應講明只用 20 張。");
  assert(outputIsClean(output), "建置輸出洩漏了秘密或檔名。");
  const html = await readFile(path.join(buildDir, "dist", "index.html"), "utf8");
  assert(!html.includes("測試彩虹") && !html.includes("測試手工"), "加密頁仍可讀到活動名稱。");
  assert(!html.includes("shot-") && !html.includes("data:image"), "加密頁仍可讀到相片或檔名。");
  assert(!html.includes("SECRET-LOCATION-MARKER"), "加密頁含有隱藏位置資料。");
  const published = await readdir(path.join(buildDir, "dist"));
  assert(published.every((name) => !/\.(jpe?g|png|webp|gif)$/i.test(name)), "輸出不應有圖片檔。");
  let leftover = false;
  try {
    const content = await readdir(path.join(buildDir, "content"), { recursive: true });
    leftover = content.some((name) => String(name).toLowerCase().endsWith(".jpg"));
  } catch {
    leftover = false;
  }
  assert(!leftover, "下載嘅相片不應留喺內容資料夾。");
} finally {
  await new Promise((resolve) => okServer.server.close(resolve));
  await rm(buildDir, { recursive: true, force: true });
}

await expectDriveFailure("deny", "讀唔到 Google Drive");
await expectDriveFailure("bad-json", "唔係有效嘅 JSON");

async function expectFolderSecretFailure(label, folderValue, includes) {
  const dir = await mkdtemp(path.join(tmpdir(), "fct-drive-folder-"));
  try {
    const result = await runBuild({
      SITE_PASSWORD: password,
      DRIVE_SERVICE_ACCOUNT_JSON: serviceAccount,
      DRIVE_FOLDER_ID: folderValue,
      OUTPUT_DIR: path.join(dir, "dist"),
      BUILD_DIR: path.join(dir, "build"),
      CONTENT_DIR: path.join(dir, "content"),
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert(result.status !== 0, `${label} 不應發佈成功。`);
    assert(output.includes(includes), `${label} 錯誤訊息不對。`);
    assert(output.includes("不會發佈"), `${label} 應講明不會發佈。`);
    assert(output.includes("secret DRIVE_FOLDER_ID"), `${label} 應講明要設定 secret。`);
    assert(outputIsClean(output), `${label} 輸出洩漏了秘密或檔名。`);
    let published = false;
    try {
      await readFile(path.join(dir, "dist", "index.html"));
      published = true;
    } catch {
      published = false;
    }
    assert(!published, `${label} 不應寫出網頁。`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

await expectFolderSecretFailure("沒有資料夾編號", "", "未設定 DRIVE_FOLDER_ID");
await expectFolderSecretFailure("空白資料夾編號", "   ", "未設定 DRIVE_FOLDER_ID");
await expectFolderSecretFailure("資料夾編號格式唔啱", "not a folder", "格式唔啱");

console.log("Drive 讀取測試通過。");
