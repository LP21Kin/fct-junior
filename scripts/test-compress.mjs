import sharp from "sharp";
import { compressPhoto } from "./lib/compress.mjs";

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
if (input.length < 400 * 1024) {
  console.error(`測試圖未夠大：${input.length}`);
  process.exit(1);
}
const output = await compressPhoto(input, "test.jpg");
const kb = Math.round(output.buffer.length / 1024);
if (output.mime !== "image/jpeg" || output.buffer.length > 300 * 1024 || output.buffer.length < 200 * 1024) {
  console.error(`壓縮結果應大約 200–300KB，而家係 ${kb}KB`);
  process.exit(1);
}
const meta = await sharp(output.buffer).metadata();
if (!meta.width || meta.width < 900) {
  console.error("壓縮後圖片太細。");
  process.exit(1);
}

const tiny = await sharp({
  create: { width: 320, height: 240, channels: 3, background: "#d7f0ff" },
}).jpeg().toBuffer();
const small = await compressPhoto(tiny, "small.jpg");
if (small.buffer.length > 300 * 1024) {
  console.error("細圖不應被放大到超過 300KB。");
  process.exit(1);
}

console.log(`壓縮測試通過：大圖 ${Math.round(input.length / 1024)}KB → ${kb}KB。`);
