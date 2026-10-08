import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { demoWeeks } from "../src/demo-weeks.mjs";

export async function seedDemo(contentDir) {
  await rm(contentDir, { recursive: true, force: true });
  for (const week of demoWeeks) {
    const dir = path.join(contentDir, "weeks", week.date);
    const photoDir = path.join(dir, "photos");
    await mkdir(photoDir, { recursive: true });
    const photos = [];
    for (const photo of week.photos) {
      await writeFile(path.join(photoDir, photo.file), photo.svg, "utf8");
      photos.push({ file: photo.file, caption: photo.caption });
    }
    const data = {
      date: week.date,
      title: week.title,
      themeColor: week.themeColor,
      memoryVerse: week.memoryVerse,
      verseRef: week.verseRef,
      points: week.points,
      prayers: week.prayers,
      photos,
    };
    await writeFile(path.join(dir, "week.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
  await writeFile(path.join(contentDir, ".source"), "demo\n", "utf8");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..");
  const contentDir = process.env.CONTENT_DIR || path.join(root, "content");
  await seedDemo(contentDir);
  console.log("已寫入試用示範內容。呢啲係假文字同圖畫。");
}
