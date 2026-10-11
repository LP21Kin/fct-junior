import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const TARGET_MAX = 300 * 1024;
const TARGET_MIN = 200 * 1024;
const HARD_MAX = 340 * 1024;
export const VIDEO_MAX_SECONDS = 30;
export const VIDEO_HARD_MAX = 2 * 1024 * 1024;

export function isVideoContainer(bytes) {
  if (!bytes || bytes.length < 12) return false;
  if (bytes.subarray(0, 64).includes(Buffer.from("ftyp"))) return true;
  return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

async function renderJpeg(buffer, width, quality) {
  return sharp(buffer, { failOn: "none", limitInputPixels: 40_000_000, pages: 1 })
    .rotate()
    .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#fffaf3" })
    .jpeg({ quality, mozjpeg: true, progressive: true })
    .toBuffer();
}

export async function compressPhoto(buffer, filename = "相片") {
  const head = buffer.subarray(0, 300).toString("utf8").trim().toLowerCase();
  if (head.includes("<svg")) return { buffer, mime: "image/svg+xml" };

  const meta = await sharp(buffer, { failOn: "none", limitInputPixels: 40_000_000, pages: 1 }).metadata();
  const originalWidth = meta.width || 1600;
  let width = Math.min(originalWidth, 2000);
  let quality = 80;
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const output = await renderJpeg(buffer, width, quality);
    const distance = output.length > TARGET_MAX
      ? output.length - TARGET_MAX
      : output.length < TARGET_MIN
        ? TARGET_MIN - output.length
        : 0;
    if (distance < bestDistance) {
      best = output;
      bestDistance = distance;
    }
    if (distance === 0) break;
    if (output.length > TARGET_MAX) {
      if (quality > 52) quality -= 7;
      else width = Math.max(720, Math.round(width * 0.84));
      continue;
    }
    if (buffer.length > TARGET_MIN && quality < 93) {
      quality += 4;
      continue;
    }
    if (buffer.length > TARGET_MIN && originalWidth > width + 40) {
      width = Math.min(originalWidth, Math.round(width * 1.08));
      continue;
    }
    break;
  }

  if (!best || best.length > HARD_MAX) {
    throw new Error(`${filename} 壓縮後仍然太大。請改用普通 JPG，或者揀另一張。`);
  }
  return { buffer: best, mime: "image/jpeg" };
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: Buffer.concat(stdout) }));
  });
}

async function probeDuration(file) {
  try {
    const result = await runCommand("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    if (result.code !== 0) return 0;
    const duration = Number(result.stdout.toString("utf8").trim());
    return Number.isFinite(duration) ? duration : 0;
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    return 0;
  }
}

export async function compressVideo(buffer, filename = "影片", options = {}) {
  const maxSeconds = options.maxSeconds ?? VIDEO_MAX_SECONDS;
  const hardMax = options.hardMax ?? VIDEO_HARD_MAX;
  const dir = await mkdtemp(path.join(tmpdir(), "fct-video-"));
  try {
    const input = path.join(dir, "in.bin");
    await writeFile(input, buffer);
    const duration = await probeDuration(input);
    const trimmed = duration > maxSeconds + 0.05;
    const attempts = [
      { width: 640, crf: 30, seconds: maxSeconds, audio: true },
      { width: 480, crf: 34, seconds: Math.min(maxSeconds, 20), audio: false },
      { width: 426, crf: 36, seconds: Math.min(maxSeconds, 12), audio: false },
    ];
    let best = null;
    for (const [index, attempt] of attempts.entries()) {
      const output = path.join(dir, `out-${index}.mp4`);
      const args = [
        "-y", "-i", input,
        "-t", String(attempt.seconds),
        "-vf", `scale=${attempt.width}:-2:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", String(attempt.crf),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-map_metadata", "-1",
        "-map", "0:v:0",
      ];
      if (attempt.audio) args.push("-map", "0:a?", "-c:a", "aac", "-b:a", "64k", "-ac", "1");
      else args.push("-an");
      args.push(output);
      let result;
      try {
        result = await runCommand("ffmpeg", args);
      } catch (error) {
        if (error?.code === "ENOENT") {
          throw new Error("搵唔到 ffmpeg，未能壓縮影片。今次不會發佈。");
        }
        throw error;
      }
      if (result.code !== 0) continue;
      const encoded = await readFile(output);
      if (!isVideoContainer(encoded)) continue;
      if (!best || encoded.length < best.length) best = encoded;
      if (encoded.length <= hardMax) return { buffer: encoded, mime: "video/mp4", trimmed };
    }
    if (!best) throw new Error(`${filename} 壓縮失敗。請改用較短嘅 mp4。今次不會發佈。`);
    throw new Error("有一段影片壓縮後仍然太大。請改用更短嘅 mp4（建議 30 秒以內），今次不會發佈。");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
