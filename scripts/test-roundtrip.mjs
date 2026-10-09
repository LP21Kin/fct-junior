import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COVER_ALT, stripCoverDataUri } from "./lib/cover.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const password = randomBytes(18).toString("base64url");
const dir = await mkdtemp(path.join(tmpdir(), "fct-round-"));
const outputDir = path.join(dir, "dist");
const buildDir = path.join(dir, "build");
const contentDir = path.join(dir, "content");

function run(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

const env = {
  ...process.env,
  SITE_PASSWORD: password,
  OUTPUT_DIR: outputDir,
  BUILD_DIR: buildDir,
  CONTENT_DIR: contentDir,
};
delete env.CONTENT_REPO;
delete env.CONTENT_READ_TOKEN;
delete env.DRIVE_SERVICE_ACCOUNT_JSON;
delete env.DRIVE_FOLDER_ID;
delete env.DRIVE_TOKEN_URL;
delete env.DRIVE_API_URL;
delete env.STATICRYPT_PASSWORD;

try {
  const built = await run("scripts/build.mjs", env);
  if (built.status !== 0) {
    console.error(built.stderr.split(password).join("[已隱藏]"));
    console.error(built.stdout.split(password).join("[已隱藏]"));
    process.exit(1);
  }
  if (`${built.stdout}${built.stderr}`.includes(password)) {
    console.error("建置輸出洩漏了測試密碼。");
    process.exit(1);
  }
  const verified = await run("scripts/verify-published.mjs", env);
  if (verified.status !== 0) {
    console.error(verified.stderr);
    process.exit(1);
  }
  const html = await readFile(path.join(outputDir, "index.html"), "utf8");
  const visible = await stripCoverDataUri(root, html);
  if (visible.includes("彩虹嘅應許") || visible.includes("data:image")) {
    console.error("加密頁仍可讀到示範內容或圖片。");
    process.exit(1);
  }
  if (!html.includes(COVER_ALT)) {
    console.error("密碼頁未有封面。");
    process.exit(1);
  }
  if (!html.includes("記住密碼")) {
    console.error("密碼頁沒有「記住密碼」。");
    process.exit(1);
  }
  if (!html.includes("請輸入密碼。呢度只給家長了解團契活動。不會對外公開") || html.includes("呢度只俾家長睇")) {
    console.error("密碼頁引言未更新。");
    process.exit(1);
  }
  console.log("加密往返測試通過。");
} finally {
  await rm(dir, { recursive: true, force: true });
}
