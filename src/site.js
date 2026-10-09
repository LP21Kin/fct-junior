const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxCaption = document.getElementById("lightbox-caption");
const lightboxCount = document.getElementById("lightbox-count");
const prevButton = document.getElementById("lightbox-prev");
const nextButton = document.getElementById("lightbox-next");
const closeButton = document.querySelector(".lightbox-close");

const albums = new Map();
for (const button of document.querySelectorAll(".photo-button")) {
  const id = button.dataset.album;
  if (!albums.has(id)) albums.set(id, []);
  albums.get(id).push(button);
}

let currentAlbum = "";
let currentIndex = 0;
let lastFocus = null;

function showCurrent() {
  const items = albums.get(currentAlbum) || [];
  const button = items[currentIndex];
  if (!button) return;
  const image = button.querySelector("img");
  lightboxImg.src = image.src;
  lightboxImg.alt = image.alt;
  lightboxCaption.textContent = image.alt;
  lightboxCount.textContent = `${currentIndex + 1} / ${items.length}`;
  prevButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex === items.length - 1;
}

function openLightbox(button) {
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

document.querySelectorAll(".photo-button").forEach((button) => {
  button.addEventListener("click", () => openLightbox(button));
});

closeButton.addEventListener("click", closeLightbox);
prevButton.addEventListener("click", () => step(-1));
nextButton.addEventListener("click", () => step(1));

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

function showSlide(stage, index) {
  const items = albums.get(stage.dataset.album) || [];
  const sourceButton = items[index];
  if (!sourceButton) return;
  const source = sourceButton.querySelector("img");
  const frame = stage.querySelector(".slideshow-photo");
  const image = frame.querySelector("img");
  const caption = stage.querySelector("figcaption");
  image.src = source.src;
  image.alt = source.alt;
  if (caption) caption.textContent = source.alt;
  frame.dataset.index = String(index);
  frame.setAttribute("aria-label", `放大：${source.alt}`);
  stage.dataset.index = String(index);
}

function advanceSlideshow(stage) {
  const items = albums.get(stage.dataset.album) || [];
  if (items.length < 2 || slideshowPaused()) return;
  const current = Number(stage.dataset.index || 0);
  showSlide(stage, nextSlideIndex(items.length, current));
}

let slideTimer = 0;

function syncSlideshow() {
  window.clearInterval(slideTimer);
  slideTimer = 0;
  if (slideshowPaused()) return;
  const stages = document.querySelectorAll(".slideshow");
  let canAdvance = false;
  for (const stage of stages) {
    if ((albums.get(stage.dataset.album) || []).length > 1) {
      canAdvance = true;
      break;
    }
  }
  if (!canAdvance) return;
  slideTimer = window.setInterval(() => {
    if (slideshowPaused()) return;
    for (const stage of document.querySelectorAll(".slideshow")) advanceSlideshow(stage);
  }, SLIDE_MS);
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
