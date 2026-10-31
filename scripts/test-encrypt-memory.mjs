import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { encodeHex, patchCryptoEngineSource } = require("./lib/staticrypt-encrypt.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticryptCli = path.join(root, "node_modules", "staticrypt", "cli", "index.js");
const preload = path.join(root, "scripts", "lib", "staticrypt-encrypt.cjs");
const enginePath = path.join(root, "node_modules", "staticrypt", "lib", "cryptoEngine.js");
const salt = "a11ce000a11ce000a11ce000a11ce000";
const password = randomBytes(18).toString("base64url");
const marker = "fct-encrypt-memory-marker";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function scrub(text) {
  return String(text || "").split(password).join("[已隱藏]");
}

function naiveHex(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function assertHex(bytes, label) {
  const actual = encodeHex(bytes);
  const expected = Buffer.from(bytes).toString("hex");
  if (actual !== expected || actual !== naiveHex(bytes)) {
    fail(`${label} 嘅 hex 同 StatiCrypt 原本唔同。`);
  }
}

assertHex(Buffer.from([]), "空內容");
assertHex(Buffer.from(Array.from({ length: 256 }, (_, index) => index)), "每個位元組");
for (const size of [1, 65535, 65536, 65537, 130000]) {
  assertHex(randomBytes(size), `${size} 個位元組`);
}

const engineSource = await readFile(enginePath, "utf8");
const patchedSource = patchCryptoEngineSource(engineSource);
if (!patchedSource || !patchedSource.includes("function encodeHex(bytes)") || patchedSource.includes("hexBytes.push")) {
  fail("未能修補 StatiCrypt 嘅 hex 編碼。");
}
if (patchCryptoEngineSource("唔係 StatiCrypt") !== null) {
  fail("唔應修補其他檔案。");
}

function runNode(args, env, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

const baseEnv = { ...process.env, STATICRYPT_PASSWORD: password };
delete baseEnv.NODE_OPTIONS;

const hashArgs = [
  "-e",
  "require('./node_modules/staticrypt/lib/cryptoEngine.js').hashPassword(process.env.STATICRYPT_PASSWORD, process.env.SALT).then((hash) => process.stdout.write(hash))",
];
const plainHash = await runNode(hashArgs, { ...baseEnv, SALT: salt });
const patchedHash = await runNode(["-r", preload, ...hashArgs], { ...baseEnv, SALT: salt });
if (plainHash.status !== 0 || patchedHash.status !== 0 || !plainHash.stdout || plainHash.stdout !== patchedHash.stdout) {
  console.error(scrub(plainHash.stderr));
  console.error(scrub(patchedHash.stderr));
  fail("修補後嘅密碼雜湊必須同原本 StatiCrypt 一樣。");
}

const dir = await mkdtemp(path.join(tmpdir(), "fct-encrypt-mem-"));
try {
  const plainPath = path.join(dir, "page.html");
  const plain = `<!doctype html><meta charset="utf-8"><title>t</title><p>${marker}</p><p>${"a".repeat(8 * 1024 * 1024)}</p>`;
  await writeFile(plainPath, plain);

  const smallHeap = { ...baseEnv, NODE_OPTIONS: "--max-old-space-size=192" };
  const commonArgs = [
    staticryptCli,
    plainPath,
    "--config", "false",
    "--salt", salt,
    "--short",
    "--directory",
  ];

  const unpatchedDir = path.join(dir, "unpatched");
  const unpatched = await runNode([...commonArgs, unpatchedDir], smallHeap);
  const unpatchedLog = `${unpatched.stdout}\n${unpatched.stderr}`;
  if (unpatched.status === 0 || !/heap out of memory|Reached heap limit|Allocation failed/i.test(unpatchedLog)) {
    console.error(scrub(unpatchedLog));
    fail("未修補嘅加密應該因為記憶體不足失敗。");
  }

  const patchedDir = path.join(dir, "patched");
  const patched = await runNode(["-r", preload, ...commonArgs, patchedDir], smallHeap);
  if (patched.status !== 0) {
    console.error(scrub(patched.stderr));
    console.error(scrub(patched.stdout));
    fail("修補後嘅加密喺細 heap 都應該成功。");
  }

  const encryptedPath = path.join(patchedDir, "page.html");
  const encrypted = await readFile(encryptedPath, "utf8");
  if (encrypted.includes(marker)) {
    fail("加密頁唔應該睇到原本內容。");
  }

  const decryptedDir = path.join(dir, "decrypted");
  const decrypted = await runNode([
    staticryptCli,
    encryptedPath,
    "--decrypt",
    "--config", "false",
    "--salt", salt,
    "--directory", decryptedDir,
  ], baseEnv);
  if (decrypted.status !== 0) {
    console.error(scrub(decrypted.stderr));
    fail("原本 StatiCrypt 解唔開修補後嘅加密頁。");
  }
  const roundTrip = await readFile(path.join(decryptedDir, "page.html"), "utf8");
  if (roundTrip !== plain) fail("解密內容同原本唔同。");
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log("加密記憶體測試通過。");
