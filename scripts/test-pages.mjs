import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { demoWeeks } from "../src/demo-weeks.mjs";
import { PAGE_SOURCES, loadInnerPages } from "./lib/pages.mjs";
import { renderSite } from "./lib/render.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const email = "reader@example.iam.gserviceaccount.com";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const staff = PAGE_SOURCES.find((page) => page.key === "staff");
const schedule = PAGE_SOURCES.find((page) => page.key === "schedule");
if (staff?.folderId !== "1A0PJ4OHBINUPHwJEi009AcdVD2-66Pqw" || staff.fileId !== "1xjfDOlSQ0R5DnqgLg_dKKVyhvLCMQMWM") {
  fail("事奉人員 Drive 位置不對。");
}
if (schedule?.folderId !== "1AB91AR2KNiXHek-6nOd275A2_3OlS06E" || schedule.fileId !== "1c6F0zn9CI_t5rIAtiTZQxOC3BM1olM5i") {
  fail("週會活動表 Drive 位置不對。");
}
const steward = PAGE_SOURCES.find((page) => page.key === "steward");
if (steward?.folderId !== "17AWoHBL6sT7vT20mmujIdWseu62DQrbj" || steward.fileId !== "1lNn9WrGKlWNbNCGsXCYTSc-MR0yQxG73") {
  fail("司事輪值表 Drive 位置不對。");
}
if (staff.folderName !== "2026_事奉人員圖像" || schedule.folderName !== "2026_周會活動行事曆" || steward.folderName !== "2026_司事輪值表") {
  fail("內頁資料夾名稱不對。");
}
if (!steward.localNames.includes("steward-roster.jpg")) fail("本機輪值表檔名不對。");

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
const serviceAccount = JSON.stringify({
  type: "service_account",
  client_email: email,
  [["private", "key"].join("_")]: pem,
});

const staffJpeg = await sharp({
  create: { width: 80, height: 48, channels: 3, background: { r: 255, g: 214, b: 160 } },
}).jpeg().toBuffer();
const scheduleJpeg = await sharp({
  create: { width: 80, height: 48, channels: 3, background: { r: 180, g: 214, b: 236 } },
}).jpeg().toBuffer();
const otherJpeg = await sharp({
  create: { width: 40, height: 40, channels: 3, background: { r: 200, g: 230, b: 190 } },
}).jpeg().toBuffer();

function startServer(files, { denyFolders = new Set() } = {}) {
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
      }
      res.writeHead(ok ? 200 : 401, { "content-type": "application/json" });
      res.end(ok ? JSON.stringify({ access_token: "page-token" }) : "{}");
      return;
    }
    if ((req.headers.authorization || "") !== "Bearer page-token") {
      res.writeHead(401);
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/drive/v3/files") {
      const parent = (url.searchParams.get("q") || "").match(/'([^']+)'/)?.[1] || "";
      if (denyFolders.has(parent)) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end("{}");
        return;
      }
      const list = files.filter((file) => file.parent === parent);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        files: list.map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: String(file.bytes?.length || 0),
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

const weeks = demoWeeks.map((week) => ({
  ...week,
  photos: week.photos.map((photo) => ({
    filename: photo.file,
    caption: photo.caption,
    bytes: Buffer.from(photo.svg),
  })),
}));

const empty = await renderSite({ root, weeks, demoMode: true });
if (!empty.html.includes('class="poster-empty"') || empty.html.includes('class="poster-scroll"')) {
  fail("沒有圖片時不應嵌內頁 JPEG。");
}
if ((empty.html.match(/class="poster-empty"/g) || []).length !== 3) fail("三張圖都未有時應有三段提示。");
if (empty.html.includes('href="steward.html"') || empty.html.includes('alt="司事輪值表"') || empty.stewardHtml) {
  fail("未有圖時主頁不應有輪值表連結或圖片。");
}

const withPages = await renderSite({
  root,
  weeks,
  demoMode: false,
  pages: { staff: staffJpeg, schedule: scheduleJpeg },
});
if ((withPages.html.match(/class="poster-empty"/g) || []).length !== 1) fail("未傳輪值表時主頁應只係輪值表空白。");
if ((withPages.html.match(/class="poster-scroll"/g) || []).length !== 2) fail("事奉人員同活動表都要有可捲動圖片。");
if (withPages.html.includes('href="steward.html"') || withPages.html.includes('alt="司事輪值表"')) {
  fail("未傳輪值表時不應有連結或圖片。");
}
if (!withPages.html.includes(`alt="事奉人員"`) || !withPages.html.includes(`alt="週會活動表"`)) {
  fail("圖片替代文字應只用頁面名稱。");
}
const fellowshipAt = withPages.html.indexOf('id="fellowship-title"');
const scheduleAt = withPages.html.indexOf('alt="週會活動表"');
const staffAt = withPages.html.indexOf('alt="事奉人員"');
if (!(fellowshipAt >= 0 && fellowshipAt < scheduleAt && scheduleAt < staffAt)) {
  fail("主頁順序應為團契金句、週會活動表、事奉人員。");
}
if (withPages.html.includes('class="site-nav"') || withPages.html.includes("data-page-panel")) {
  fail("不應再用舊式內頁導覽。");
}
if (withPages.stewardHtml) fail("不應再輸出獨立輪值表頁。");
if (withPages.html.includes("staff.jpg") || withPages.html.includes("schedule.jpg")) fail("頁面不應有檔名。");
const staffUri = withPages.html.match(/alt="事奉人員" src="(data:image\/jpeg;base64,[^"]+)"/);
if (!staffUri) fail("事奉人員圖片未嵌進網頁。");
const embedded = Buffer.from(staffUri[1].slice("data:image/jpeg;base64,".length), "base64");
const embeddedMeta = await sharp(embedded).metadata();
if (embeddedMeta.exif || embedded.length < 100) fail("嵌圖應係去掉隱藏資料嘅 JPEG。");

const rosterJpeg = await sharp({
  create: { width: 70, height: 120, channels: 3, background: { r: 214, g: 84, b: 48 } },
}).jpeg().toBuffer();
const newerRoster = await sharp({
  create: { width: 72, height: 120, channels: 3, background: { r: 232, g: 164, b: 64 } },
}).jpeg().toBuffer();
const split = await renderSite({
  root,
  weeks,
  demoMode: false,
  pages: { staff: staffJpeg, schedule: scheduleJpeg, steward: rosterJpeg },
});
const rosterUri = split.html.match(/alt="司事輪值表" src="(data:image\/jpeg;base64,[^"]+)"/);
if (!rosterUri) fail("輪值表圖片未嵌進主頁。");
if (split.stewardHtml || split.html.includes('href="steward.html"')) fail("主頁不應再連去獨立輪值表頁。");
if ((split.html.match(/class="poster-scroll"/g) || []).length !== 3) fail("主頁應有三張可捲動圖片。");
if (!split.html.includes("touch-action: pan-x pan-y pinch-zoom")) fail("輪值表應可以雙指放大。");
const staffImageAt = split.html.indexOf('alt="事奉人員"');
const rosterImageAt = split.html.indexOf('alt="司事輪值表"');
const weekLabelAt = split.html.indexOf("今週周會");
if (!(staffImageAt >= 0 && staffImageAt < rosterImageAt && rosterImageAt < weekLabelAt)) {
  fail("輪值表應排喺事奉人員同今週周會之間。");
}
if (split.html.includes("steward-roster")) fail("頁面不應有輪值表檔名。");

const localDir = await mkdtemp(path.join(tmpdir(), "fct-pages-"));
await writeFile(path.join(localDir, "staff.jpg"), otherJpeg);
await writeFile(path.join(localDir, "steward-roster.jpg"), rosterJpeg);
await writeFile(path.join(localDir, "notes.txt"), "不要讀取");
const local = await loadInnerPages({
  root,
  env: { PAGE_ASSETS_DIR: localDir },
});
if (!local.staff?.equals(otherJpeg) || local.schedule || !local.missing.includes("週會活動表")) {
  fail("本機圖片只應讀指定 JPEG。");
}
if (!local.steward?.equals(rosterJpeg) || local.missing.includes("司事輪值表")) {
  fail("本機應讀到 private-pages/steward-roster.jpg。");
}

const driveFiles = [
  { id: "staffFile001", parent: "staffFolder01", name: "roster.jpg", mimeType: "image/jpeg", bytes: staffJpeg },
  { id: "staffOld0001", parent: "staffFolder01", name: "old.jpg", mimeType: "image/jpeg", bytes: otherJpeg },
  { id: "schedFile001", parent: "schedFolder01", name: "week.jpg", mimeType: "image/jpeg", bytes: scheduleJpeg },
  { id: "parentNote01", parent: "parentFolder1", name: "readme.txt", mimeType: "text/plain", bytes: Buffer.from("no") },
];
const sources = [
  { ...staff, folderId: "staffFolder01", fileId: "staffFile001" },
  { ...schedule, folderId: "schedFolder01", fileId: "missingFile01" },
];
const driveServer = await startServer(driveFiles);
try {
  const loaded = await loadInnerPages({
    root,
    driveJson: serviceAccount,
    env: {
      PAGE_ASSETS_DIR: localDir,
      DRIVE_TOKEN_URL: driveServer.tokenUrl,
      DRIVE_API_URL: driveServer.apiUrl,
    },
    sources,
  });
  if (!loaded.staff?.equals(staffJpeg)) fail("應使用指定嘅事奉人員檔。");
  if (!loaded.schedule?.equals(scheduleJpeg)) fail("找不到指定檔時應用資料夾入面嘅 JPEG。");
  if (loaded.missing.length) fail("兩頁都有圖時不應報缺失。");
  if (loaded.staff.equals(otherJpeg)) fail("有 Drive 圖時不應改用本機檔。");
} finally {
  await new Promise((resolve) => driveServer.server.close(resolve));
}

const denied = await startServer(driveFiles, { denyFolders: new Set(["staffFolder01", "schedFolder01", "1I6ZMTTBqVvPpaRUXWaVNpytXvE23Wgjy"]) });
const blockedDir = await mkdtemp(path.join(tmpdir(), "fct-pages-empty-"));
try {
  const loaded = await loadInnerPages({
    root,
    driveJson: serviceAccount,
    env: {
      PAGE_ASSETS_DIR: blockedDir,
      DRIVE_TOKEN_URL: denied.tokenUrl,
      DRIVE_API_URL: denied.apiUrl,
    },
    sources: sources.map((page) => ({ ...page, fileId: "notShared000" })),
  });
  if (loaded.staff || loaded.schedule) fail("讀唔到 Drive 又不應改用空目錄。");
  if (loaded.missing.length !== 2) fail("讀唔到圖片時應標明兩頁都缺。");
} finally {
  await new Promise((resolve) => denied.server.close(resolve));
  await rm(blockedDir, { recursive: true, force: true });
  await rm(localDir, { recursive: true, force: true });
}

const parentFiles = [
  { id: "namedStaff01", parent: "1I6ZMTTBqVvPpaRUXWaVNpytXvE23Wgjy", name: "2026_事奉人員圖像", mimeType: "application/vnd.google-apps.folder" },
  { id: "namedSched01", parent: "1I6ZMTTBqVvPpaRUXWaVNpytXvE23Wgjy", name: "2026_周會活動行事曆", mimeType: "application/vnd.google-apps.folder" },
  { id: "namedDuty001", parent: "1I6ZMTTBqVvPpaRUXWaVNpytXvE23Wgjy", name: "2026_司事輪值表", mimeType: "application/vnd.google-apps.folder" },
  { id: "viaParent001", parent: "namedStaff01", name: "people.jpg", mimeType: "image/jpeg", bytes: staffJpeg },
  { id: "viaParent002", parent: "namedSched01", name: "plan.jpg", mimeType: "image/jpeg", bytes: scheduleJpeg },
  { id: "viaParent003", parent: "namedDuty001", name: "261103_ 司事輪值表.jpg", mimeType: "image/jpeg", bytes: rosterJpeg },
];
const parentServer = await startServer(parentFiles, { denyFolders: new Set(["missingStaff1", "missingSched1", "missingDuty01"]) });
try {
  const loaded = await loadInnerPages({
    root,
    driveJson: serviceAccount,
    env: {
      PAGE_ASSETS_DIR: path.join(tmpdir(), "fct-pages-none"),
      DRIVE_TOKEN_URL: parentServer.tokenUrl,
      DRIVE_API_URL: parentServer.apiUrl,
    },
    sources: [
      { ...staff, folderId: "missingStaff1", fileId: "no-such-file" },
      { ...schedule, folderId: "missingSched1", fileId: "no-such-file" },
      { ...steward, folderId: "missingDuty01", fileId: "no-such-file" },
    ],
  });
  if (!loaded.staff?.equals(staffJpeg) || !loaded.schedule?.equals(scheduleJpeg) || !loaded.steward?.equals(rosterJpeg)) {
    fail("子資料夾讀唔到時應改由網站資料夾名稱搵圖。");
  }
} finally {
  await new Promise((resolve) => parentServer.server.close(resolve));
}

const rosterFiles = [
  { id: "dutyKnown001", parent: "dutyFolder001", name: "261103_ 司事輪值表.jpg", mimeType: "image/jpeg", bytes: rosterJpeg },
  { id: "dutyNewer001", parent: "dutyFolder001", name: "261201_roster.jpg", mimeType: "image/jpeg", bytes: newerRoster },
];
const rosterServer = await startServer(rosterFiles);
try {
  const preferred = await loadInnerPages({
    root,
    driveJson: serviceAccount,
    env: {
      PAGE_ASSETS_DIR: path.join(tmpdir(), "fct-pages-none"),
      DRIVE_TOKEN_URL: rosterServer.tokenUrl,
      DRIVE_API_URL: rosterServer.apiUrl,
    },
    sources: [{ ...steward, folderId: "dutyFolder001", fileId: "dutyKnown001" }],
  });
  if (!preferred.steward?.equals(rosterJpeg)) fail("輪值表應優先用指定檔，即使資料夾有更新檔名。");
  const latest = await loadInnerPages({
    root,
    driveJson: serviceAccount,
    env: {
      PAGE_ASSETS_DIR: path.join(tmpdir(), "fct-pages-none"),
      DRIVE_TOKEN_URL: rosterServer.tokenUrl,
      DRIVE_API_URL: rosterServer.apiUrl,
    },
    sources: [{ ...steward, folderId: "dutyFolder001", fileId: "missingFile01" }],
  });
  if (!latest.steward?.equals(newerRoster)) fail("找不到指定檔時應用檔名順序最後嘅 JPEG。");
} finally {
  await new Promise((resolve) => rosterServer.server.close(resolve));
}

const secretField = ["private", "key"].join("_");
const pageSourceText = JSON.stringify(PAGE_SOURCES);
if (pageSourceText.includes("SITE_PASSWORD") || pageSourceText.includes(secretField)) {
  fail("內頁設定不應有密碼或密鑰。");
}

console.log("主頁圖片測試通過：週會活動表、事奉人員、司事輪值表都嵌喺主頁。");
