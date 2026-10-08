import { spawn } from "node:child_process";
import { mkdtemp, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
console.log("失敗關閉測試通過。");
