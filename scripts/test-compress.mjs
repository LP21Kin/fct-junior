import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { compressDocument, compressPhoto, compressVideo, isVideoContainer } from "./lib/compress.mjs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function sampleClip(args, filename) {
  const dir = await mkdtemp(path.join(tmpdir(), "fct-clip-"));
  const file = path.join(dir, filename);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn("ffmpeg", ["-y", ...args, file], { stdio: ["ignore", "ignore", "pipe"] });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
    });
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function durationOf(buffer) {
  const dir = await mkdtemp(path.join(tmpdir(), "fct-probe-"));
  const file = path.join(dir, "clip.mp4");
  try {
    await writeFile(file, buffer);
    const stdout = await new Promise((resolve, reject) => {
      const child = spawn("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file,
      ], { stdio: ["ignore", "pipe", "ignore"] });
      let text = "";
      child.stdout.on("data", (chunk) => { text += chunk; });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve(text) : reject(new Error("ffprobe"))));
    });
    return Number(stdout.trim());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const width = 2000;
const height = 1500;
const circles = [];
for (let i = 0; i < 700; i += 1) {
  const x = (i * 97) % width;
  const y = (i * 53) % height;
  const r = 18 + (i % 55);
  const color = ["#7EC8E3", "#FFE7A3", "#C9E8C3", "#F6C1A6", "#E3D4F5", "#F7A8B8", "#8ECAE6"][i % 7];
  circles.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="0.9"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#fff8ee"/>
  ${circles.join("")}
</svg>`;
const input = await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
if (input.length < 400 * 1024) fail(`測試圖未夠大：${input.length}`);
const output = await compressPhoto(input, "test.jpg");
const kb = Math.round(output.buffer.length / 1024);
if (output.mime !== "image/jpeg" || output.buffer.length > 300 * 1024 || output.buffer.length < 200 * 1024) {
  fail(`壓縮結果應大約 200–300KB，而家係 ${kb}KB`);
}
const meta = await sharp(output.buffer).metadata();
if (!meta.width || meta.width < 900) fail("壓縮後圖片太細。");

const tiny = await sharp({
  create: { width: 320, height: 240, channels: 3, background: "#d7f0ff" },
}).jpeg().toBuffer();
const small = await compressPhoto(tiny, "small.jpg");
if (small.buffer.length > 300 * 1024) fail("細圖不應被放大到超過 300KB。");

const clip = await sampleClip(
  ["-f", "lavfi", "-i", "testsrc=size=320x240:rate=8:duration=1", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-an"],
  "clip.mp4",
);
const webm = await sampleClip(
  ["-f", "lavfi", "-i", "color=c=red:s=160x120:d=1", "-c:v", "libvpx-vp9", "-b:v", "80k", "-an"],
  "clip.webm",
);
const longClip = await sampleClip(
  ["-f", "lavfi", "-i", "color=c=blue:s=160x120:d=4", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-an"],
  "long.mp4",
);
const compressedClip = await compressVideo(clip, "clip.mp4");
if (compressedClip.mime !== "video/mp4" || !isVideoContainer(compressedClip.buffer) || compressedClip.buffer.length > 2 * 1024 * 1024) {
  fail("影片應壓成細小 mp4。");
}
const fromWebm = await compressVideo(webm, "clip.webm");
if (fromWebm.mime !== "video/mp4" || !isVideoContainer(fromWebm.buffer)) fail("webm 應轉成 mp4。");
const trimmed = await compressVideo(longClip, "long.mp4", { maxSeconds: 1 });
if (!trimmed.trimmed) fail("長過上限嘅影片應標記為只用開頭。");
const trimmedDuration = await durationOf(trimmed.buffer);
if (!(trimmedDuration > 0.2 && trimmedDuration <= 1.4)) fail(`影片應剪到大約 1 秒，而家係 ${trimmedDuration}`);
let tooBig = false;
try {
  await compressVideo(clip, "clip.mp4", { hardMax: 1 });
} catch (error) {
  tooBig = error.message.includes("仍然太大") && error.message.includes("不會發佈");
}
if (!tooBig) fail("壓唔細嘅影片應停止發佈。");

const poster = await sharp({
  create: { width: 2400, height: 1350, channels: 3, background: "#fff6ea" },
}).jpeg().withMetadata({ exif: { IFD0: { ImageDescription: "SECRET-PAGE-MARKER" } } }).toBuffer();
const documentImage = await compressDocument(poster, "事奉人員");
if (documentImage.mime !== "image/jpeg" || documentImage.buffer.includes(Buffer.from("SECRET-PAGE-MARKER"))) {
  fail("內頁圖片應去掉隱藏資料。");
}
if (documentImage.width < 1600 || documentImage.buffer.length > 800 * 1024) {
  fail("內頁圖片應保持可讀尺寸。");
}
const docMeta = await sharp(documentImage.buffer).metadata();
if (docMeta.exif) fail("內頁圖片仍有 EXIF。");

console.log(`壓縮測試通過：大圖 ${Math.round(input.length / 1024)}KB → ${kb}KB，影片 ${compressedClip.buffer.length} bytes。`);
