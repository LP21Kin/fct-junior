import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COVER_ALT, stripCoverDataUri } from "./lib/cover.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = process.env.OUTPUT_DIR || path.join(root, "dist");
const buildDir = process.env.BUILD_DIR || path.join(root, "build");
const allowed = new Set(["index.html", "404.html", "robots.txt"]);
const imageName = /\.(jpe?g|png|gif|webp|heic|heif|svg|avif|bmp|tiff?)$/i;

function fail(message) {
  console.error(`加密檢查失敗：${message}`);
  process.exit(1);
}

const entries = await readdir(distDir, { withFileTypes: true });
if (entries.some((entry) => entry.isDirectory())) fail("輸出資料夾入面有子資料夾。");
const names = entries.map((entry) => entry.name);
for (const name of names) {
  if (!allowed.has(name)) fail(`輸出有多餘檔案 ${name}`);
  if (imageName.test(name)) fail(`輸出有圖片檔 ${name}`);
}
if (!names.includes("index.html")) fail("沒有加密後的首頁。");

const strings = JSON.parse(await readFile(path.join(buildDir, "check-strings.json"), "utf8"));
if (!Array.isArray(strings) || strings.length < 5) fail("缺少明文對照清單，無法確認。");

const password = process.env.SITE_PASSWORD || "";
for (const name of names) {
  const filePath = path.join(distDir, name);
  const info = await stat(filePath);
  if (!info.isFile()) fail(`${name} 不是檔案。`);
  const text = await readFile(filePath, "utf8");
  const visible = await stripCoverDataUri(root, text);
  if (visible.includes("data:image")) fail(`${name} 含有未加密圖片。`);
  if (text.includes("data-plaintext-root")) fail(`${name} 含有未加密頁面。`);
  if (password && password.length >= 4 && text.includes(password)) {
    fail("輸出入面出現咗密碼字串。已停止。");
  }
  for (const phrase of strings) {
    if (phrase && text.includes(phrase)) fail(`${name} 含有未加密內容。`);
  }
}

const index = await readFile(path.join(distDir, "index.html"), "utf8");
if (!index.includes("staticrypt") || !index.includes("記住密碼") || !index.includes("staticrypt-remember")) {
  fail("密碼頁不完整，或者未有「記住密碼」。");
}
if (!index.includes("福泉堂 初級團")) fail("密碼頁缺少網站名稱。");
if (!index.includes('class="cover-art"') || !index.includes(COVER_ALT)) fail("密碼頁未有封面圖。");

console.log("加密檢查通過：輸出只有密碼頁同加密內容，沒有明文或圖片檔。");
