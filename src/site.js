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
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.removeAttribute("src");
  document.documentElement.classList.remove("lightbox-open");
  if (lastFocus) lastFocus.focus();
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
