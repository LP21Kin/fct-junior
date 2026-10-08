import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const imageName = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?)$/i;
const blockedPrefixes = ["content/", "dist/", "build/", "private-content/"];
const magic = [
  { name: "JPEG", bytes: Buffer.from([0xff, 0xd8, 0xff]) },
  { name: "PNG", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  { name: "GIF", bytes: Buffer.from("GIF8") },
];

function fail(message) {
  console.error(`隱私檢查失敗：${message}`);
  process.exit(1);
}

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
if (files.length === 0) fail("搵唔到已追蹤檔案。");

for (const file of files) {
  const normalized = file.replaceAll("\\", "/");
  if (blockedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    fail(`${file} 不應出現在公開專案。`);
  }
  if (imageName.test(normalized)) fail(`${file} 係圖片檔。公開專案不可以提交相片。`);
  if (normalized.includes("/photos/")) fail(`${file} 位於相片資料夾。`);
  if (normalized.endsWith(".env") || normalized.includes(".env.")) fail(`${file} 可能含有密碼。`);

  const full = path.resolve(file);
  const info = statSync(full);
  if (normalized !== "package-lock.json" && info.size > 400 * 1024) {
    fail(`${file} 太大，公開專案不應存放大型檔案。`);
  }
  const sample = readFileSync(full).subarray(0, 16);
  for (const item of magic) {
    if (sample.subarray(0, item.bytes.length).equals(item.bytes)) {
      fail(`${file} 內容似 ${item.name} 圖片。`);
    }
  }
  if (sample.subarray(0, 4).toString() === "RIFF" && readFileSync(full).subarray(8, 12).toString() === "WEBP") {
    fail(`${file} 內容似 WEBP 圖片。`);
  }
}

const workflow = readFileSync(".github/workflows/pages.yml", "utf8");
for (const required of ["secrets.SITE_PASSWORD", "workflow_dispatch", "verify-published.mjs", "actions/deploy-pages", "path: dist"]) {
  if (!workflow.includes(required)) fail(`發佈流程缺少 ${required}`);
}
if (!/branches:\s*\[main\]/.test(workflow)) fail("發佈流程必須只在 main 分支推送時運行。");
if (/echo\s+["']?\$\{?SITE_PASSWORD/.test(workflow) || /--password\s+\S+/.test(workflow)) {
  fail("發佈流程似乎會顯示或寫入密碼。");
}
if (!workflow.includes("exit 1")) fail("缺少密碼時發佈流程必須停止。");

console.log("隱私檢查通過：公開專案沒有相片檔，發佈流程會在沒有密碼時停止。");
