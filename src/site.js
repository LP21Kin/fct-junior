const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxVideo = document.getElementById("lightbox-video");
const lightboxCaption = document.getElementById("lightbox-caption");
const lightboxCount = document.getElementById("lightbox-count");
const prevButton = document.getElementById("lightbox-prev");
const nextButton = document.getElementById("lightbox-next");
const fullButton = document.getElementById("lightbox-full");
const closeButton = document.querySelector(".lightbox-close");

const albums = new Map();
for (const button of document.querySelectorAll(".media-source")) {
  const id = button.dataset.album;
  if (!albums.has(id)) albums.set(id, []);
  albums.get(id).push(button);
}

let currentAlbum = "";
let currentIndex = 0;
let lastFocus = null;

function stopVideo(video) {
  if (!video) return;
  video.pause();
  video.onended = null;
  video.onloadedmetadata = null;
  video.removeAttribute("src");
  video.load();
}

function playMuted(video) {
  video.muted = true;
  video.defaultMuted = true;
  video.setAttribute("muted", "");
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  const pending = video.play();
  if (pending && typeof pending.catch === "function") pending.catch(() => {});
}

function showCurrent() {
  const items = albums.get(currentAlbum) || [];
  const button = items[currentIndex];
  if (!button) return;
  const caption = button.dataset.caption || "";
  const kind = button.dataset.kind === "video" ? "video" : "image";
  lightboxCaption.textContent = caption;
  lightboxCount.textContent = `${currentIndex + 1} / ${items.length}`;
  prevButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex === items.length - 1;
  if (kind === "video") {
    const source = button.querySelector("video");
    lightboxImg.hidden = true;
    lightboxImg.removeAttribute("src");
    lightboxImg.alt = "";
    lightboxVideo.hidden = false;
    lightboxVideo.controls = true;
    lightboxVideo.src = source ? source.src : "";
    playMuted(lightboxVideo);
    return;
  }
  stopVideo(lightboxVideo);
  lightboxVideo.hidden = true;
  const image = button.querySelector("img");
  lightboxImg.hidden = false;
  lightboxImg.src = image.src;
  lightboxImg.alt = image.alt;
}

function pauseSlideshowVideos() {
  for (const video of document.querySelectorAll(".slideshow-photo video")) video.pause();
}

function openLightbox(button) {
  pauseSlideshowVideos();
  currentAlbum = button.dataset.album;
  currentIndex = Number(button.dataset.index);
  lastFocus = button;
  showCurrent();
  lightbox.hidden = false;
  document.documentElement.classList.add("lightbox-open");
  closeButton.focus();
  syncSlideshow();
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.removeAttribute("src");
  stopVideo(lightboxVideo);
  lightboxVideo.hidden = true;
  document.documentElement.classList.remove("lightbox-open");
  if (lastFocus) lastFocus.focus();
  syncSlideshow();
}

function step(delta) {
  const items = albums.get(currentAlbum) || [];
  const next = currentIndex + delta;
  if (next < 0 || next >= items.length) return;
  currentIndex = next;
  showCurrent();
}

closeButton.addEventListener("click", closeLightbox);
prevButton.addEventListener("click", () => step(-1));
nextButton.addEventListener("click", () => step(1));
fullButton.addEventListener("click", () => {
  const target = lightboxVideo.hidden ? lightboxImg : lightboxVideo;
  const request = target.requestFullscreen || target.webkitRequestFullscreen || target.webkitEnterFullscreen;
  if (typeof request !== "function") return;
  try {
    const result = request.call(target);
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    // 有啲瀏覽器唔支援全螢幕，lightbox 本身已經放大。
  }
});

lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});

document.addEventListener("keydown", (event) => {
  if (lightbox.hidden) return;
  if (event.key === "Escape") closeLightbox();
  if (event.key === "ArrowLeft") step(-1);
  if (event.key === "ArrowRight") step(1);
});

let touchStartX = 0;
lightbox.addEventListener("touchstart", (event) => {
  touchStartX = event.changedTouches[0].clientX;
}, { passive: true });
lightbox.addEventListener("touchend", (event) => {
  const delta = event.changedTouches[0].clientX - touchStartX;
  if (delta > 50) step(-1);
  if (delta < -50) step(1);
}, { passive: true });

const SLIDE_MS = 4500;
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

function nextSlideIndex(length, current, random) {
  const roll = typeof random === "function" ? random : Math.random;
  const count = length | 0;
  if (count <= 1) return 0;
  let index = current | 0;
  if (index < 0 || index >= count) index = 0;
  const span = count - 1;
  let pick = Math.floor(roll() * span);
  if (pick < 0) pick = 0;
  if (pick >= span) pick = span - 1;
  return (index + 1 + pick) % count;
}

function slideshowPaused() {
  return motionQuery.matches || !lightbox.hidden;
}

const stageTimers = new WeakMap();

function clearStageTimer(stage) {
  const timer = stageTimers.get(stage);
  if (timer) window.clearTimeout(timer);
  stageTimers.delete(stage);
}

function scheduleAdvance(stage) {
  clearStageTimer(stage);
  const items = albums.get(stage.dataset.album) || [];
  if (items.length < 2 || slideshowPaused()) return;
  const video = stage.querySelector(".slideshow-photo video");
  const playingVideo = stage.dataset.kind === "video" && video && !video.hidden;
  if (!playingVideo) {
    stageTimers.set(stage, window.setTimeout(() => advanceSlideshow(stage), SLIDE_MS));
    return;
  }
  const arm = () => {
    if (stage.dataset.kind !== "video" || slideshowPaused()) return;
    const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : 8000;
    const remaining = Math.max(800, durationMs - video.currentTime * 1000 + 400);
    clearStageTimer(stage);
    stageTimers.set(stage, window.setTimeout(() => advanceSlideshow(stage), Math.min(30000, remaining)));
  };
  if (Number.isFinite(video.duration)) arm();
  else {
    video.onloadedmetadata = () => {
      video.onloadedmetadata = null;
      arm();
    };
    stageTimers.set(stage, window.setTimeout(() => advanceSlideshow(stage), 30000));
  }
}

function showSlide(stage, index) {
  const items = albums.get(stage.dataset.album) || [];
  const sourceButton = items[index];
  if (!sourceButton) return;
  const frame = stage.querySelector(".slideshow-photo");
  const image = frame.querySelector("img");
  const video = frame.querySelector("video");
  const caption = stage.querySelector("figcaption");
  const kindMark = stage.querySelector(".slide-kind");
  const sourceCaption = sourceButton.dataset.caption || "";
  const kind = sourceButton.dataset.kind === "video" ? "video" : "image";
  stopVideo(video);
  if (kind === "video") {
    const source = sourceButton.querySelector("video");
    image.hidden = true;
    image.removeAttribute("src");
    image.alt = "";
    video.hidden = false;
    video.controls = false;
    video.preload = "auto";
    video.src = source ? source.src : "";
    video.onended = () => advanceSlideshow(stage);
    if (!slideshowPaused()) playMuted(video);
    frame.setAttribute("aria-label", `放大影片：${sourceCaption}`);
    if (kindMark) kindMark.hidden = false;
  } else {
    const source = sourceButton.querySelector("img");
    video.hidden = true;
    image.hidden = false;
    image.src = source.src;
    image.alt = source.alt;
    frame.setAttribute("aria-label", `放大：${source.alt}`);
    if (kindMark) kindMark.hidden = true;
  }
  if (caption) caption.textContent = sourceCaption || image.alt;
  frame.dataset.index = String(index);
  stage.dataset.index = String(index);
  stage.dataset.kind = kind;
}

function advanceSlideshow(stage) {
  clearStageTimer(stage);
  const items = albums.get(stage.dataset.album) || [];
  if (items.length < 2 || slideshowPaused()) return;
  const current = Number(stage.dataset.index || 0);
  showSlide(stage, nextSlideIndex(items.length, current));
  scheduleAdvance(stage);
}

function syncSlideshow() {
  const stages = document.querySelectorAll(".slideshow");
  for (const stage of stages) {
    clearStageTimer(stage);
    const video = stage.querySelector(".slideshow-photo video");
    if (video && slideshowPaused()) video.pause();
  }
  if (slideshowPaused()) return;
  for (const stage of stages) {
    if (stage.dataset.kind === "video") {
      const video = stage.querySelector(".slideshow-photo video");
      if (video && video.src) playMuted(video);
    }
    scheduleAdvance(stage);
  }
}

for (const stage of document.querySelectorAll(".slideshow")) {
  const items = albums.get(stage.dataset.album) || [];
  if (!items.length) continue;
  showSlide(stage, Number(stage.dataset.index || 0));
  stage.querySelector(".slideshow-photo").addEventListener("click", () => {
    const index = Number(stage.dataset.index || 0);
    const button = (albums.get(stage.dataset.album) || [])[index];
    if (!button) return;
    openLightbox(button);
    lastFocus = stage.querySelector(".slideshow-photo");
  });
}

if (typeof motionQuery.addEventListener === "function") {
  motionQuery.addEventListener("change", syncSlideshow);
} else if (typeof motionQuery.addListener === "function") {
  motionQuery.addListener(syncSlideshow);
}

syncSlideshow();

document.getElementById("forget-password")?.addEventListener("click", () => {
  try {
    localStorage.removeItem("staticrypt_passphrase");
    localStorage.removeItem("staticrypt_expiration");
  } catch {
    // 私人模式可能唔俾用 localStorage，仍然會重新載入密碼頁。
  }
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.set("forget", String(Date.now()));
  window.location.replace(url.toString());
});
