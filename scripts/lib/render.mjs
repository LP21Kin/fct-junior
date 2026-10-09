import { readFile } from "node:fs/promises";
import path from "node:path";
import { compressPhoto } from "./compress.mjs";

const PRIVACY_TITLE = "溫馨提示";
const PRIVACY_BODY = "呢度只畀初級團家長睇 💛 私人小天地，唔對外公開；請大家唔好轉發，一齊保護小朋友🙏🏻";
const FELLOWSHIP_TITLE = "團契金句";
const FELLOWSHIP_LEAD = "小小門徒・大大榜樣";
const FELLOWSHIP_VERSE = "「不可叫人小看你年輕，總要在言語、行為、愛心、信心、清潔上，都作信徒的榜樣。」— 提摩太前書 4:12";

const UI_STRINGS = [
  "今週周會",
  "活動回顧",
  "代禱事項",
  "金句",
  "重點",
  "主題",
  "撳一張相可以放大",
  "試用示範",
  "清除呢部裝置記住咗嘅密碼",
  "去睇相片",
  "嚟自最近一次聚會",
  "請唔好公開轉發裡面嘅內容",
  "每週聚會回顧，只供家長睇",
  "今次未有代禱事項。",
  "fukchuen-junior-v1",
  PRIVACY_TITLE,
  PRIVACY_BODY,
  FELLOWSHIP_TITLE,
  FELLOWSHIP_LEAD,
  FELLOWSHIP_VERSE,
];

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("zh-HK", {
    weekday: "long",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(`${iso}T12:00:00+08:00`));
  return `${year}年${month}月${day}日 · ${weekday}`;
}

function miniCross() {
  return `<svg class="mini-cross" viewBox="0 0 36 36" aria-hidden="true">
    <rect x="15" y="4" width="6" height="28" rx="3" fill="#F4E2B4"/>
    <rect x="6" y="13" width="24" height="6" rx="3" fill="#F4E2B4"/>
  </svg>`;
}

function titleIcon(kind) {
  if (kind === "album") {
    return `<svg class="title-icon" viewBox="0 0 46 30" aria-hidden="true">
      <path d="M4 24 A16 16 0 0 1 28 24" fill="none" stroke="#F7A8B8" stroke-width="4" stroke-linecap="round"/>
      <path d="M8 24 A12 12 0 0 1 24 24" fill="none" stroke="#FFD98A" stroke-width="4" stroke-linecap="round"/>
      <path d="M12 24 A8 8 0 0 1 20 24" fill="none" stroke="#8ECAE6" stroke-width="4" stroke-linecap="round"/>
      <path fill="#FFE08A" d="M36 4 L38 10 L44 11 L39 15 L41 21 L36 18 L31 21 L33 15 L28 11 L34 10 Z"/>
    </svg>`;
  }
  return `<svg class="title-icon" viewBox="0 0 46 30" aria-hidden="true">
    <ellipse cx="24" cy="16" rx="16" ry="8" fill="#ffffff"/>
    <path d="M20 15 C10 6 2 12 12 18" fill="#F7FBFF"/>
    <path d="M36 14 L44 16 L36 18 Z" fill="#F6C1A6"/>
  </svg>`;
}

function collectStrings(weeks, demoMode) {
  const strings = new Set(UI_STRINGS);
  if (demoMode) strings.add("文字同圖畫都係假的");
  for (const week of weeks) {
    for (const value of [week.title, week.memoryVerse, week.verseRef, week.date, formatDate(week.date)]) {
      if (value) strings.add(value);
    }
    for (const item of [...week.points, ...week.prayers, ...week.photos.map((photo) => photo.caption)]) {
      if (item) strings.add(item);
    }
  }
  return [...strings].filter((item) => [...item].length >= 2);
}

export async function renderSite({ root, weeks, demoMode }) {
  const [css, js, coverArt] = await Promise.all([
    readFile(path.join(root, "src/styles.css"), "utf8"),
    readFile(path.join(root, "src/site.js"), "utf8"),
    readFile(path.join(root, "src/cover-art.svg"), "utf8"),
  ]);
  const latest = weeks[0];
  let photoCount = 0;
  let photoBytes = 0;

  const albums = [];
  for (const week of weeks) {
    const figures = [];
    for (const [index, photo] of week.photos.entries()) {
      const compressed = await compressPhoto(photo.bytes, photo.filename);
      photoCount += 1;
      photoBytes += compressed.buffer.length;
      const src = `data:${compressed.mime};base64,${compressed.buffer.toString("base64")}`;
      const caption = escapeHtml(photo.caption);
      figures.push(`<li><figure>
        <button class="photo-button" type="button" data-album="${escapeHtml(week.date)}" data-index="${index}" aria-label="放大：${caption}">
          <img alt="${caption}" src="${src}" width="640" height="640" loading="lazy" decoding="async">
        </button>
        <figcaption>${caption}</figcaption>
      </figure></li>`);
    }
    albums.push(`<article class="album" style="--accent:${week.themeColor}">
      <div class="stripe"></div>
      <div class="album-body">
        <header class="album-head">
          <div>
            <h3>${escapeHtml(week.title)}</h3>
            <p>${escapeHtml(formatDate(week.date))}</p>
          </div>
          <span class="count">${week.photos.length} 張</span>
        </header>
        <ul class="photo-grid">${figures.join("")}</ul>
      </div>
    </article>`);
  }

  const points = latest.points
    .map((point, index) => `<li><span class="num">${index + 1}</span><span>${escapeHtml(point)}</span></li>`)
    .join("");
  const verse = latest.memoryVerse
    ? `<figure class="verse">
          ${miniCross()}
          <figcaption class="verse-label">金句</figcaption>
          <blockquote><p>${escapeHtml(latest.memoryVerse)}</p></blockquote>
          ${latest.verseRef ? `<cite>${escapeHtml(latest.verseRef)}</cite>` : ""}
        </figure>`
    : "";
  const pointsCard = latest.points.length
    ? `<div class="points-card">
          <h3>重點</h3>
          <ol class="points">${points}</ol>
        </div>`
    : "";
  const details = verse || pointsCard ? `<div class="this-week-grid">${verse}${pointsCard}</div>` : "";
  const prayers = latest.prayers.length
    ? latest.prayers.map((item) => `<li><span class="dot" aria-hidden="true">+</span><span>${escapeHtml(item)}</span></li>`).join("")
    : `<li><span class="dot" aria-hidden="true">+</span><span>今次未有代禱事項。</span></li>`;

  const banner = demoMode
    ? `<p class="demo-banner" role="status">呢個係試用示範。文字同圖畫都係假的，唔係真聚會紀錄。</p>`
    : "";
  const privacyNotice = `<aside class="privacy-notice" aria-labelledby="privacy-title">
      <h2 id="privacy-title">${escapeHtml(PRIVACY_TITLE)}</h2>
      <p>${escapeHtml(PRIVACY_BODY)}</p>
    </aside>`;
  const fellowshipVerse = `<section class="fellowship" aria-labelledby="fellowship-title">
      <div class="stripe" aria-hidden="true"></div>
      <div class="fellowship-body">
        ${miniCross()}
        <h2 id="fellowship-title">${escapeHtml(FELLOWSHIP_TITLE)}</h2>
        <p class="fellowship-lead">${escapeHtml(FELLOWSHIP_LEAD)}</p>
        <blockquote>
          <p>${escapeHtml(FELLOWSHIP_VERSE)}</p>
        </blockquote>
      </div>
    </section>`;

  const html = `<!DOCTYPE html>
<html lang="zh-Hant-HK">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>福泉堂 初級團</title>
  <style>${css}</style>
</head>
<body data-plaintext-root="fukchuen-junior-v1">
  <main class="wrap">
    ${banner}
    <header class="hero">
      <div class="hero-banner">
        <div class="cover-frame">${coverArt}</div>
        <h1>福泉堂 初級團</h1>
        <p class="tagline">每週聚會回顧，只供家長睇</p>
      </div>
    </header>
    ${privacyNotice}
    ${fellowshipVerse}
    <section class="panel this-week" style="--accent:${latest.themeColor}" aria-labelledby="this-week-title">
      <div class="panel-top">
        <span class="pill">今週周會</span>
        <p class="date">${escapeHtml(formatDate(latest.date))}</p>
      </div>
      <p class="theme-label">主題</p>
      <h2 id="this-week-title">${escapeHtml(latest.title)}</h2>
      ${details}
      <div class="jump-links">
        <a href="#albums">去睇相片</a>
        <a href="#prayers">代禱事項</a>
      </div>
    </section>
    <section id="albums">
      <div class="section-head">
        <h2 class="section-title">${titleIcon("album")}活動回顧</h2>
        <p>由新到舊。撳一張相可以放大。</p>
      </div>
      ${albums.join("")}
    </section>
    <section id="prayers" class="panel prayers">
      <h2 class="section-title">${titleIcon("dove")}代禱事項</h2>
      <p class="prayer-note">嚟自最近一次聚會（${escapeHtml(formatDate(latest.date))}）</p>
      <ul class="prayer-list">${prayers}</ul>
    </section>
    <footer class="site-footer">
      <p>福泉堂 初級團</p>
      <p>請唔好公開轉發裡面嘅內容。</p>
      <button class="text-button" id="forget-password" type="button">清除呢部裝置記住咗嘅密碼</button>
    </footer>
  </main>
  <div id="lightbox" class="lightbox" hidden role="dialog" aria-modal="true" aria-labelledby="lightbox-caption">
    <button class="lightbox-close" type="button" aria-label="關閉">×</button>
    <figure class="lightbox-stage">
      <img id="lightbox-img" alt="">
      <figcaption id="lightbox-caption"></figcaption>
    </figure>
    <div class="lightbox-toolbar">
      <button id="lightbox-prev" type="button">上一張</button>
      <span id="lightbox-count"></span>
      <button id="lightbox-next" type="button">下一張</button>
    </div>
  </div>
  <script>${js}</script>
</body>
</html>`;

  return {
    html,
    strings: collectStrings(weeks, demoMode),
    photoCount,
    averageKb: photoCount ? Math.round(photoBytes / photoCount / 1024) : 0,
  };
}
