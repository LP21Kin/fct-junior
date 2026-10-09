import { readFile } from "node:fs/promises";
import path from "node:path";

export const COVER_REPO_PATH = "src/cover-art.jpg";
export const COVER_ALT = "福泉堂初級團封面";
export const COVER_WIDTH = 2000;
export const COVER_HEIGHT = 1068;

export async function readCoverDataUri(root) {
  const bytes = await readFile(path.join(root, COVER_REPO_PATH));
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

export async function coverImgTag(root) {
  const src = await readCoverDataUri(root);
  return `<img class="cover-art" alt="${COVER_ALT}" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" src="${src}">`;
}

export async function stripCoverDataUri(root, text) {
  const src = await readCoverDataUri(root);
  return text.split(src).join("");
}
