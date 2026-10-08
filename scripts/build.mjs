import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, cp, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedDemo } from "./seed-demo.mjs";
import { DriveError, driveSettings, importDriveWeeks } from "./lib/drive.mjs";
import { loadWeeks } from "./lib/weeks.mjs";
import { renderSite } from "./lib/render.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = process.env.CONTENT_DIR || path.join(root, "content");
const buildDir = process.env.BUILD_DIR || path.join(root, "build");
const distDir = process.env.OUTPUT_DIR || path.join(root, "dist");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function scrub(text, secrets) {
  let output = text || "";
  for (const secret of secrets) {
    if (secret) output = output.split(secret).join("[已隱藏]");
  }
  return output;
}

const password = process.env.SITE_PASSWORD || "";
const token = process.env.CONTENT_READ_TOKEN || "";
const repo = (process.env.CONTENT_REPO || "").trim();
const driveJson = (process.env.DRIVE_SERVICE_ACCOUNT_JSON || "").trim();
const secretValues = [password, token, driveJson].filter(Boolean);

if (!password) {
  fail("未設定 SITE_PASSWORD。為咗保護內容，今次不會產生任何網頁。");
}
if (password.length < 8) {
  fail("SITE_PASSWORD 太短。請用最少 8 個字元，建議 16 個以上。今次不會發佈。");
}
if (["password", "12345678", "changeme", "staticrypt"].includes(password.toLowerCase())) {
  fail("SITE_PASSWORD 太易估。請換一個更長、更特別嘅密碼。今次不會發佈。");
}
const contentReady = Boolean(repo && token);
const contentHalf = Boolean(repo) !== Boolean(token);
if (!driveJson && contentReady && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
  fail("CONTENT_REPO 格式要係「帳號/專案名」。今次不會發佈。");
}
if (!driveJson && contentReady && /\s/.test(token)) {
  fail("CONTENT_READ_TOKEN 格式唔啱。今次不會發佈。");
}

async function hasWeekFolders() {
  try {
    const entries = await readdir(path.join(contentDir, "weeks"), { withFileTypes: true });
    return entries.some((entry) => entry.isDirectory() && !entry.name.startsWith("."));
  } catch {
    return false;
  }
}

async function readSource() {
  try {
    return (await readFile(path.join(contentDir, ".source"), "utf8")).trim();
  } catch {
    return "";
  }
}

async function fetchPrivateContent() {
  const dest = await mkdtemp(path.join(tmpdir(), "fct-content-"));
  try {
    const result = await run("git", [
      "-c", "core.hooksPath=/dev/null",
      "-c", `http.extraheader=AUTHORIZATION: bearer ${token}`,
      "clone", "--depth", "1", "--quiet",
      `https://github.com/${repo}.git`,
      dest,
    ]);
    if (result.status !== 0) {
      console.error("連唔到私人內容倉。請檢查 CONTENT_REPO 同 CONTENT_READ_TOKEN。今次不會發佈。");
      console.error(scrub(`${result.stderr || ""}\n${result.stdout || ""}`, secretValues).split("\n").slice(0, 12).join("\n"));
      process.exit(1);
    }
    const candidates = [path.join(dest, "weeks"), path.join(dest, "content", "weeks")];
    const source = candidates.find((candidate) => existsSync(candidate));
    if (!source) {
      fail("私人倉入面搵唔到 weeks 資料夾。今次不會發佈。");
    }
    await rm(contentDir, { recursive: true, force: true });
    await mkdir(path.join(contentDir, "weeks"), { recursive: true });
    await cp(source, path.join(contentDir, "weeks"), { recursive: true, dereference: false });
    await writeFile(path.join(contentDir, ".source"), "private\n", "utf8");
  } finally {
    await rm(dest, { recursive: true, force: true });
  }
}

function run(command, args, extraEnv = {}) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", ...extraEnv };
  delete env.DRIVE_SERVICE_ACCOUNT_JSON;
  delete env.CONTENT_READ_TOKEN;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 5 * 60 * 1000);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

let demoMode = false;
let weeks;
if (driveJson) {
  let driveSettingsOk = true;
  try {
    driveSettings();
  } catch (error) {
    driveSettingsOk = false;
    console.error(error instanceof DriveError ? error.message : "Drive 設定唔啱。今次不會發佈。");
    process.exitCode = 1;
  }
  const dest = driveSettingsOk ? await mkdtemp(path.join(tmpdir(), "fct-drive-")) : "";
  if (dest) {
    try {
      const summary = await importDriveWeeks({ jsonText: driveJson, destDir: dest });
      weeks = await loadWeeks(dest, { drive: true });
      if (!weeks.length) throw new DriveError("Drive 資料夾入面搵唔到可用嘅週次。今次不會發佈。");
      console.log(`已從 Google Drive 讀取 ${summary.weeks} 個週次、${summary.photos} 張相片。`);
      if (summary.capped) console.log("有週次相片多過 20 張，網站只用咗 20 張。");
    } catch (error) {
      const message = error instanceof DriveError
        ? error.message
        : "讀取 Google Drive 失敗。今次不會發佈。";
      console.error(scrub(message, secretValues));
      process.exitCode = 1;
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  }
  if (process.exitCode) process.exit(process.exitCode);
} else if (contentReady) {
  await fetchPrivateContent();
  console.log("已讀取私人內容倉。");
} else if (contentHalf || !(await hasWeekFolders()) || (await readSource()) === "demo") {
  if (contentHalf) {
    console.log("CONTENT_REPO 同 CONTENT_READ_TOKEN 未設定齊，今次用試用示範。");
  } else {
    console.log("未有私人內容倉，使用試用示範（假文字同圖畫）。");
  }
  await seedDemo(contentDir);
  demoMode = true;
}

if (!weeks) {
  try {
    weeks = await loadWeeks(contentDir);
  } catch {
    process.exit(process.exitCode || 1);
  }
}
if (!weeks.length) fail("搵唔到任何一週內容。今次不會發佈。");

const rendered = await renderSite({ root, weeks, demoMode });
await rm(buildDir, { recursive: true, force: true });
await mkdir(path.join(buildDir, "plaintext"), { recursive: true });
const plaintextPath = path.join(buildDir, "plaintext", "index.html");
await writeFile(plaintextPath, rendered.html, "utf8");
await writeFile(path.join(buildDir, "check-strings.json"), `${JSON.stringify(rendered.strings, null, 2)}\n`, "utf8");
const coverArt = await readFile(path.join(root, "src", "cover-art.svg"), "utf8");
const passwordTemplate = (await readFile(path.join(root, "src", "password_template.html"), "utf8")).replace(
  "<!--COVER_ART-->",
  coverArt.trim(),
);
if (!passwordTemplate.includes('class="cover-art"')) {
  fail("密碼頁未有封面圖。今次不會發佈。");
}
const passwordTemplatePath = path.join(buildDir, "password_template.html");
await writeFile(passwordTemplatePath, passwordTemplate, "utf8");

const saltFile = JSON.parse(await readFile(path.join(root, ".staticrypt.json"), "utf8"));
if (!saltFile.salt || !/^[0-9a-fA-F]{32}$/.test(saltFile.salt)) {
  fail("加密設定唔完整。今次不會發佈。");
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const encrypt = await run(process.execPath, [
  path.join(root, "node_modules", "staticrypt", "cli", "index.js"),
  plaintextPath,
  "--directory", distDir,
  "--config", "false",
  "--salt", saltFile.salt,
  "--short",
  "--remember", "180",
  "--template", passwordTemplatePath,
  "--template-title", "福泉堂 初級團",
  "--template-instructions", "請輸入密碼。呢度只俾家長睇。",
  "--template-placeholder", "密碼",
  "--template-button", "進入",
  "--template-remember", "記住密碼",
  "--template-error", "密碼唔啱，請再試一次",
  "--template-toggle-show", "顯示密碼",
  "--template-toggle-hide", "隱藏密碼",
  "--template-color-primary", "#FFE08A",
  "--template-color-secondary", "#E7F4FF",
], { STATICRYPT_PASSWORD: password });
await rm(path.join(buildDir, "plaintext"), { recursive: true, force: true });

if (encrypt.status !== 0) {
  await rm(distDir, { recursive: true, force: true });
  console.error("加密失敗。為咗安全，已刪除輸出，不會發佈。");
  console.error(scrub(`${encrypt.stderr || ""}\n${encrypt.stdout || ""}`, secretValues));
  process.exit(1);
}

if (!existsSync(path.join(distDir, "index.html"))) {
  await rm(distDir, { recursive: true, force: true });
  console.error("加密後搵唔到首頁。不會發佈。");
  console.error(scrub(`${encrypt.stdout}\n${encrypt.stderr}`, secretValues));
  process.exit(1);
}

await cp(path.join(root, "src", "404.html"), path.join(distDir, "404.html"));
await cp(path.join(root, "public", "robots.txt"), path.join(distDir, "robots.txt"));

const verified = await run(process.execPath, ["scripts/verify-published.mjs"]);
if (verified.status !== 0) {
  await rm(distDir, { recursive: true, force: true });
  console.error(scrub(`${verified.stdout}\n${verified.stderr}`, secretValues));
  process.exit(verified.status || 1);
}

const sizeNote = rendered.averageKb >= 80
  ? `平均約 ${rendered.averageKb}KB`
  : "圖畫檔案好細";
console.log(`已加密網站。處理咗 ${rendered.photoCount} 張圖，${sizeNote}。`);
