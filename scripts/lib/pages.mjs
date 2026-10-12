import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DriveError,
  downloadDriveFile,
  isDriveFolder,
  isDriveJpeg,
  isJpeg,
  listDriveChildren,
  openDriveSession,
} from "./drive.mjs";

const PARENT_FOLDER_ID = "1I6ZMTTBqVvPpaRUXWaVNpytXvE23Wgjy";
const MAX_BYTES = 12 * 1024 * 1024;

export const PAGE_SOURCES = [
  {
    key: "staff",
    label: "事奉人員",
    folderId: "1A0PJ4OHBINUPHwJEi009AcdVD2-66Pqw",
    folderName: "2026_事奉人員圖像",
    fileId: "1xjfDOlSQ0R5DnqgLg_dKKVyhvLCMQMWM",
    localNames: ["staff.jpg", "staff.jpeg"],
  },
  {
    key: "schedule",
    label: "週會活動表",
    folderId: "1AB91AR2KNiXHek-6nOd275A2_3OlS06E",
    folderName: "2026_周會活動行事曆",
    fileId: "1c6F0zn9CI_t5rIAtiTZQxOC3BM1olM5i",
    localNames: ["schedule.jpg", "schedule.jpeg"],
  },
];

function emptyResult() {
  return { staff: null, schedule: null, missing: [], usedDrive: false };
}

function byName(a, b) {
  return String(a.name).localeCompare(String(b.name), "en", { numeric: true, sensitivity: "base" });
}

function chooseJpeg(files, preferredFileId) {
  const jpegs = files.filter((file) => isDriveJpeg(file) && /^[A-Za-z0-9_-]+$/.test(String(file.id || "")));
  const preferred = jpegs.find((file) => file.id === preferredFileId);
  if (preferred) return preferred;
  jpegs.sort(byName);
  return jpegs.at(-1) || null;
}

async function childrenOf(session, folderId) {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(String(folderId || ""))) return null;
  try {
    return await listDriveChildren(session, folderId);
  } catch (error) {
    if (error instanceof DriveError) return null;
    throw error;
  }
}

async function folderChildren(session, page) {
  const direct = await childrenOf(session, page.folderId);
  if (direct) return direct;
  const parent = await childrenOf(session, PARENT_FOLDER_ID);
  if (!parent) return null;
  const folder = parent.find((entry) => isDriveFolder(entry) && entry.name === page.folderName);
  if (!folder || !/^[A-Za-z0-9_-]+$/.test(String(folder.id || ""))) return null;
  return childrenOf(session, folder.id);
}

async function readDrivePage(session, page) {
  const children = await folderChildren(session, page);
  const chosen = children ? chooseJpeg(children, page.fileId) : null;
  const fileId = chosen?.id || page.fileId;
  if (!fileId) return null;
  try {
    const bytes = await downloadDriveFile(session, fileId, MAX_BYTES);
    return isJpeg(bytes) ? bytes : null;
  } catch (error) {
    if (error instanceof DriveError) return null;
    throw error;
  }
}

async function readLocalPage(dir, names) {
  for (const name of names) {
    try {
      const bytes = await readFile(path.join(dir, name));
      if (isJpeg(bytes) && bytes.length <= MAX_BYTES) return bytes;
    } catch {
      // 下一個檔名，或者呢頁未有本機檔。
    }
  }
  return null;
}

export async function loadInnerPages({
  root,
  driveJson = "",
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  sources = PAGE_SOURCES,
} = {}) {
  const result = emptyResult();
  const jsonText = String(driveJson || "").trim();
  let session = null;
  if (jsonText) {
    try {
      session = await openDriveSession({ jsonText, fetchImpl, now, env });
      result.usedDrive = true;
    } catch (error) {
      if (!(error instanceof DriveError)) throw error;
    }
  }

  const dir = String(env.PAGE_ASSETS_DIR || "").trim() || path.join(root, "private-pages");
  for (const page of sources) {
    let bytes = null;
    if (session) bytes = await readDrivePage(session, page);
    if (!bytes) bytes = await readLocalPage(dir, page.localNames);
    result[page.key] = bytes;
    if (!bytes) result.missing.push(page.label);
  }
  return result;
}
