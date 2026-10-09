import vm from "node:vm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoWeeks } from "../src/demo-weeks.mjs";
import { COVER_ALT } from "./lib/cover.mjs";
import { renderSite } from "./lib/render.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lead = "請輸入密碼。呢度只給家長了解團契活動。不會對外公開";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const template = await readFile(path.join(root, "src/password_template.html"), "utf8");
const buildSource = await readFile(path.join(root, "scripts/build.mjs"), "utf8");
const siteSource = await readFile(path.join(root, "src/site.js"), "utf8");
if (!template.includes(`<p class="lead">${lead}</p>`)) fail("密碼頁未有新引言。");
if (template.includes("呢度只俾家長睇")) fail("密碼頁仲有舊引言。");
if (!buildSource.includes(`"--template-instructions", "${lead}"`)) fail("加密指令未同步新引言。");
if (!siteSource.includes('"(prefers-reduced-motion: reduce)"') || !siteSource.includes("!lightbox.hidden") || !siteSource.includes("const SLIDE_MS = 4500")) {
  fail("輪播未有計時、隨機暫停或者減少動態。");
}

const matcher = siteSource.match(/function nextSlideIndex\(length, current, random\) \{[\s\S]*?\n\}/);
if (!matcher) fail("搵唔到下一張相片嘅演算法。");
const nextSlideIndex = vm.runInNewContext(`${matcher[0]}\nnextSlideIndex`);
if (nextSlideIndex(0, 0) !== 0 || nextSlideIndex(1, 0) !== 0) fail("一張或者冇相時不應亂轉。");
for (let length = 2; length <= 6; length += 1) {
  for (let current = 0; current < length; current += 1) {
    for (const roll of [0, 0.2, 0.5, 0.999999, 1]) {
      const next = nextSlideIndex(length, current, () => roll);
      if (next === current || next < 0 || next >= length) fail(`下一張唔正確：${length} 張由 ${current} 去 ${next}`);
    }
  }
}

const weeks = demoWeeks.map((week) => ({
  ...week,
  photos: week.photos.map((photo) => ({
    filename: photo.file,
    caption: photo.caption,
    bytes: Buffer.from(photo.svg),
  })),
}));
const rendered = await renderSite({ root, weeks, demoMode: true });
const { html, strings } = rendered;
if (!strings.includes("相簿會自動換相")) fail("加密字串清單未有輪播提示。");
if (strings.includes(lead)) fail("密碼頁公開文字唔應該放入加密對照清單。");
if (!html.includes("相簿會自動換相，撳一張相可以放大。")) fail("相簿說明未有自動換相。");
if (!html.includes(COVER_ALT) || !html.includes('class="cover-art"')) fail("入面頁未有封面 A。");
if (html.includes("cover-art.svg")) fail("入面頁仲用舊封面。");
const slideshows = [...html.matchAll(/<figure class="slideshow"[\s\S]*?<\/figure>/g)];
if (slideshows.length !== weeks.length) fail(`每個週次都要有輪播，而家係 ${slideshows.length} 個。`);
for (const week of weeks) {
  const block = slideshows.find((item) => item[0].includes(`data-album="${week.date}"`));
  if (!block) fail(`${week.date} 沒有自己嘅輪播。`);
  if (block[0].includes(" src=")) fail(`${week.date} 輪播重複嵌咗圖片。`);
  if (!html.includes(`class="album" style="--accent:${week.themeColor}"`)) fail(`${week.date} 未有主題色。`);
}
const framed = html.match(/class="photo-frame photo-button"/g) || [];
const photoCount = weeks.reduce((sum, week) => sum + week.photos.length, 0);
if (framed.length !== photoCount) fail("相格未有柔和相框。");
if (!html.includes("color-mix(in srgb, var(--accent, #7ec8e3) 40%, #fffaf3)")) fail("相框未有用每週主題色。");
if (!html.includes("function syncSlideshow()") || !html.includes("function nextSlideIndex(length, current, random)")) {
  fail("入面頁未有輪播程式。");
}

console.log("介面檢查通過：密碼引言、輪播同相框都齊。");
