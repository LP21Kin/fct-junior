import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COVER_ALT, stripCoverDataUri } from "./lib/cover.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runBuild(extraEnv) {
  const env = { ...process.env, ...extraEnv };
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

async function expectFail(label, env, includes) {
  const dir = await mkdtemp(path.join(tmpdir(), "fct-fail-"));
  const result = await runBuild({
    ...env,
    OUTPUT_DIR: path.join(dir, "dist"),
    BUILD_DIR: path.join(dir, "build"),
    CONTENT_DIR: path.join(dir, "content"),
  });
  if (result.status === 0) {
    console.error(`${label}：不應成功`);
    process.exit(1);
  }
  if (!result.stderr.includes(includes)) {
    console.error(`${label}：錯誤訊息不對`);
    console.error(result.stderr);
    process.exit(1);
  }
  try {
    await access(path.join(dir, "dist", "index.html"));
    console.error(`${label}：不應寫出網頁`);
    process.exit(1);
  } catch {
    // 沒有輸出，正是我們要的。
  }
}

await expectFail("沒有密碼", { SITE_PASSWORD: "" }, "未設定 SITE_PASSWORD");
await expectFail("密碼太短", { SITE_PASSWORD: "short12" }, "太短");
await expectFail("密碼太易", { SITE_PASSWORD: "password" }, "太易估");
await expectFail("兩個內容 secret 但格式錯", {
  SITE_PASSWORD: randomBytes(18).toString("base64url"),
  DRIVE_SERVICE_ACCOUNT_JSON: "",
  CONTENT_REPO: "not a repo",
  CONTENT_READ_TOKEN: "present-token",
}, "格式要係");

const demoPassword = randomBytes(18).toString("base64url");

async function expectDemo(label, env, hidden) {
  const dir = await mkdtemp(path.join(tmpdir(), "fct-demo-"));
  const result = await runBuild({
    SITE_PASSWORD: demoPassword,
    DRIVE_SERVICE_ACCOUNT_JSON: "",
    DRIVE_FOLDER_ID: "",
    CONTENT_REPO: "",
    CONTENT_READ_TOKEN: "",
    ...env,
    OUTPUT_DIR: path.join(dir, "dist"),
    BUILD_DIR: path.join(dir, "build"),
    CONTENT_DIR: path.join(dir, "content"),
  });
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status !== 0) {
    console.error(`${label}：應該改用試用示範`);
    console.error(output.split(demoPassword).join("[已隱藏]"));
    process.exit(1);
  }
  if (!output.includes("未設定齊") || !output.includes("試用示範")) {
    console.error(`${label}：沒有說明今次用試用示範`);
    process.exit(1);
  }
  if (hidden.some((value) => value && output.includes(value))) {
    console.error(`${label}：輸出洩漏了 secret。`);
    process.exit(1);
  }
  const html = await readFile(path.join(dir, "dist", "index.html"), "utf8");
  const visible = await stripCoverDataUri(root, html);
  if (visible.includes("彩虹嘅應許") || visible.includes("data:image") || hidden.some((value) => value && html.includes(value))) {
    console.error(`${label}：網頁含有未加密內容。`);
    process.exit(1);
  }
  if (!html.includes(COVER_ALT)) {
    console.error(`${label}：密碼頁未有封面。`);
    process.exit(1);
  }
  if (!html.includes("記住密碼")) {
    console.error(`${label}：密碼頁不完整。`);
    process.exit(1);
  }
}

const loneToken = `token-${randomBytes(8).toString("hex")}`;
const loneRepo = "example-owner/example-content";
await expectDemo("只有讀取權杖", { CONTENT_READ_TOKEN: loneToken }, [loneToken, demoPassword]);
await expectDemo("只有內容倉名", { CONTENT_REPO: loneRepo }, [loneRepo, demoPassword]);
console.log("失敗關閉測試通過。");
