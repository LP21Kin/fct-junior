import sharp from "sharp";

const TARGET_MAX = 300 * 1024;
const TARGET_MIN = 200 * 1024;
const HARD_MAX = 340 * 1024;

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
