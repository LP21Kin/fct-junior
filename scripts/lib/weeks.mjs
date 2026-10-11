import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isVideoContainer } from "./compress.mjs";

const PHOTO_EXT = /\.(jpe?g|png|webp|gif|heic|heif|svg)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const PLACEHOLDERS = new Set(["喺度寫今次主題", "喺度寫金句", "YYYY-MM-DD", "經文出處"]);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
}

function asText(value, field, max) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${field} 未填。請打開 week.json 填好，今次不會發佈。`);
  }
  const text = value.trim();
  if (PLACEHOLDERS.has(text)) {
    fail(`${field} 仍然係示例文字。請改成真正內容，今次不會發佈。`);
  }
  if ([...text].length > max) {
    fail(`${field} 太長。請寫短啲，今次不會發佈。`);
  }
  return text;
}

function asList(value, field, maxItem) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${field} 要係一個清單。今次不會發佈。`);
  return value.map((item, index) => asText(item, `${field} 第 ${index + 1} 項`, maxItem));
}

async function findMedia(weekDir, filename, folders) {
  const candidates = folders.map((folder) => path.join(weekDir, folder, filename));
  candidates.push(path.join(weekDir, filename));
  for (const candidate of candidates) {
    let info;
    try {
      info = await lstat(candidate);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (info.isSymbolicLink() || !info.isFile()) {
      fail("內容入面唔可以用捷徑或者其他唔係檔案嘅項目。今次不會發佈。");
    }
    return candidate;
  }
  return null;
}

export async function loadWeeks(contentDir, options = {}) {
  const weeksDir = path.join(contentDir, "weeks");
  let entries = [];
  try {
    entries = await readdir(weeksDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const weeks = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    weeks.push(await loadWeek(path.join(weeksDir, entry.name), entry.name, options));
  }
  weeks.sort((a, b) => b.date.localeCompare(a.date));
  const seen = new Set();
  for (const week of weeks) {
    if (seen.has(week.date)) fail(`有兩個週次用咗同一個日期 ${week.date}。今次不會發佈。`);
    seen.add(week.date);
  }
  return weeks;
}

function optionalText(value, field, max) {
  if (value == null || value === "") return "";
  return asText(value, field, max);
}

async function loadWeek(weekDir, folderName, options) {
  const jsonPath = path.join(weekDir, "week.json");
  let raw;
  try {
    raw = await readFile(jsonPath, "utf8");
  } catch {
    fail(`weeks/${folderName} 缺少 week.json。今次不會發佈。`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    fail(`weeks/${folderName}/week.json 格式唔啱，請檢查逗號同引號。今次不會發佈。`);
  }

  const date = asText(data.date, `weeks/${folderName} 嘅 date`, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    fail(`weeks/${folderName} 嘅 date 要寫成 2026-10-11 呢種格式。今次不會發佈。`);
  }
  const themeColor = data.themeColor ? String(data.themeColor).trim() : "#A9D4F5";
  if (!/^#[0-9A-Fa-f]{6}$/.test(themeColor)) {
    fail(`weeks/${folderName} 嘅 themeColor 要用 # 加 6 個色碼，例如 #A9D4F5。今次不會發佈。`);
  }

  const photos = Array.isArray(data.photos) ? data.photos : [];
  const videos = Array.isArray(data.videos) ? data.videos : [];
  if (photos.length > 50) {
    fail(`weeks/${folderName} 相片多過 50 張。請每週最多放 50 張。今次不會發佈。`);
  }
  if (videos.length > 2) {
    fail(`weeks/${folderName} 影片多過 2 段。請每週最多放 2 段。今次不會發佈。`);
  }

  const points = asList(data.points, `weeks/${folderName} 嘅 points`, 60);
  if (!options.drive && points.length === 0) fail(`weeks/${folderName} 請至少寫一個重點。今次不會發佈。`);

  const loadedPhotos = [];
  for (const [index, photo] of photos.entries()) {
    const filename = asText(photo?.file, `weeks/${folderName} 第 ${index + 1} 張相嘅 file`, 80);
    if (!/^[A-Za-z0-9._-]+$/.test(filename) || filename.includes("..") || !PHOTO_EXT.test(filename)) {
      fail(`相片檔名只可以用 01.jpg 呢種簡單英文名。今次不會發佈。`);
    }
    const caption = asText(photo?.caption, `weeks/${folderName} 第 ${index + 1} 張相嘅 caption`, 24);
    const filePath = await findMedia(weekDir, filename, ["photos"]);
    if (!filePath) fail(`weeks/${folderName} 搵唔到相片 ${filename}。今次不會發佈。`);
    const bytes = await readFile(filePath);
    if (filename.toLowerCase().endsWith(".svg")) {
      const text = bytes.toString("utf8");
      if (/<script|javascript:|on\w+=/i.test(text)) {
        fail(`${filename} 唔安全，不會使用。今次不會發佈。`);
      }
    }
    loadedPhotos.push({ filename, caption, bytes });
  }

  const loadedVideos = [];
  for (const [index, video] of videos.entries()) {
    const filename = asText(video?.file, `weeks/${folderName} 第 ${index + 1} 段影片嘅 file`, 80);
    if (!/^[A-Za-z0-9._-]+$/.test(filename) || filename.includes("..") || !VIDEO_EXT.test(filename)) {
      fail("影片檔名只可以用 clip.mp4 呢種簡單英文名。請優先用 mp4。今次不會發佈。");
    }
    const caption = asText(video?.caption, `weeks/${folderName} 第 ${index + 1} 段影片嘅 caption`, 24);
    const filePath = await findMedia(weekDir, filename, ["videos"]);
    if (!filePath) fail(`weeks/${folderName} 搵唔到影片 ${filename}。今次不會發佈。`);
    const bytes = await readFile(filePath);
    if (bytes.length > MAX_VIDEO_BYTES) {
      fail(`weeks/${folderName} 有一段影片大過 80MB。請剪短或者壓細，今次不會發佈。`);
    }
    if (!isVideoContainer(bytes)) {
      fail(`weeks/${folderName} 有一段影片格式唔啱。請改用 mp4。今次不會發佈。`);
    }
    loadedVideos.push({ filename, caption, bytes });
  }

  return {
    date,
    title: asText(data.title, `weeks/${folderName} 嘅 title`, options.drive ? 40 : 30),
    themeColor,
    memoryVerse: options.drive
      ? optionalText(data.memoryVerse, `weeks/${folderName} 嘅 memoryVerse`, 120)
      : asText(data.memoryVerse, `weeks/${folderName} 嘅 memoryVerse`, 120),
    verseRef: options.drive
      ? optionalText(data.verseRef, `weeks/${folderName} 嘅 verseRef`, 24)
      : asText(data.verseRef, `weeks/${folderName} 嘅 verseRef`, 24),
    points,
    prayers: asList(data.prayers, `weeks/${folderName} 嘅 prayers`, 60),
    photos: loadedPhotos,
    videos: loadedVideos,
  };
}
