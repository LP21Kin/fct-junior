// 試用圖畫。呢啲係程式畫出嚟嘅圖，唔係相片，亦都冇真人。

function star(cx, cy, r, fill) {
  const p = r * 0.28;
  return `<path fill="${fill}" d="M${cx} ${cy - r} L${cx + p} ${cy - p} L${cx + r} ${cy} L${cx + p} ${cy + p} L${cx} ${cy + r} L${cx - p} ${cy + p} L${cx - r} ${cy} L${cx - p} ${cy - p} Z"/>`;
}

function cross(x, y, s, fill = "#F4E2B4") {
  const w = s * 0.28;
  const rx = w / 2;
  return `<g fill="${fill}">
    <rect x="${x - w / 2}" y="${y - s / 2}" width="${w}" height="${s}" rx="${rx}"/>
    <rect x="${x - s / 2}" y="${y - w / 2}" width="${s}" height="${w}" rx="${rx}"/>
  </g>`;
}

function cloud(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="#ffffff">
    <ellipse cx="0" cy="8" rx="48" ry="24"/>
    <ellipse cx="-28" cy="14" rx="28" ry="18"/>
    <ellipse cx="30" cy="16" rx="30" ry="18"/>
    <ellipse cx="6" cy="-6" rx="26" ry="20"/>
  </g>`;
}

function rainbow(cx, cy, r) {
  const colors = ["#F7A8B8", "#FFD98A", "#B7E4C7", "#8ECAE6"];
  return colors
    .map((c, i) => {
      const rr = r - i * 26;
      return `<path d="M${cx - rr} ${cy} A${rr} ${rr} 0 0 1 ${cx + rr} ${cy}" fill="none" stroke="${c}" stroke-width="18" stroke-linecap="round"/>`;
    })
    .join("");
}

function hills() {
  return `<path d="M0 470 C120 400 200 520 320 460 C430 410 520 500 640 440 L640 640 L0 640 Z" fill="#C9E8C3"/>
    <path d="M0 530 C140 470 240 560 380 510 C500 470 560 540 640 500 L640 640 L0 640 Z" fill="#A9D8B4"/>`;
}

function doll(x, y, shirt) {
  return `<g transform="translate(${x} ${y})">
    <rect x="-16" y="18" width="32" height="54" rx="14" fill="${shirt}"/>
    <circle cx="0" cy="0" r="20" fill="#F6D3B0"/>
    <rect x="-28" y="28" width="14" height="32" rx="7" fill="${shirt}"/>
    <rect x="14" y="28" width="14" height="32" rx="7" fill="${shirt}"/>
  </g>`;
}

function frame(bg, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
  <rect width="640" height="640" fill="${bg}"/>
  ${body}
</svg>`;
}

function dove(x, y, scale) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <ellipse cx="0" cy="6" rx="54" ry="26" fill="#ffffff"/>
    <ellipse cx="40" cy="-4" rx="20" ry="16" fill="#ffffff"/>
    <path d="M-8 4 C-55 -36 -92 -8 -40 12" fill="#F7FBFF" stroke="#D5E4EF" stroke-width="3"/>
    <path d="M-6 10 C-36 40 -4 46 10 16" fill="#F4FAFF" stroke="#D5E4EF" stroke-width="3"/>
    <path d="M58 -6 L82 0 L58 6 Z" fill="#F6C1A6"/>
    <circle cx="48" cy="-8" r="3" fill="#7AA0B8"/>
  </g>`;
}

export const demoArt = {
  rainbowSky: frame(
    "#D7F0FF",
    `${cloud(150, 120, 1)}
    ${cloud(470, 150, 0.85)}
    <circle cx="530" cy="110" r="42" fill="#FFE08A"/>
    ${rainbow(320, 430, 230)}
    ${hills()}
    ${cross(120, 500, 42, "#FFF8E4")}
    ${star(90, 80, 16, "#FFE08A")}
    ${star(250, 70, 10, "#FFFFFF")}`
  ),
  rainbowCraft: frame(
    "#FFF6E4",
    `<rect x="70" y="250" width="500" height="250" rx="28" fill="#F3D7A1"/>
    <rect x="90" y="270" width="460" height="28" rx="10" fill="#F7A8B8"/>
    <rect x="90" y="312" width="460" height="28" rx="10" fill="#FFD98A"/>
    <rect x="90" y="354" width="460" height="28" rx="10" fill="#B7E4C7"/>
    <rect x="90" y="396" width="460" height="28" rx="10" fill="#8ECAE6"/>
    ${doll(180, 150, "#8ECAE6")}
    ${doll(320, 140, "#F7A8B8")}
    ${doll(460, 155, "#C9E8C3")}
    ${star(80, 80, 18, "#FFE08A")}
    ${star(560, 90, 14, "#F7A8B8")}`
  ),
  storyBook: frame(
    "#E7F6FF",
    `<path d="M70 170 H300 Q320 170 320 200 V500 H90 Q70 500 70 470 Z" fill="#FFFDF8"/>
    <path d="M570 170 H340 Q320 170 320 200 V500 H550 Q570 500 570 470 Z" fill="#FFF8EA"/>
    ${rainbow(210, 360, 90)}
    ${cross(450, 300, 54, "#F4E2B4")}
    <rect x="300" y="168" width="16" height="334" rx="6" fill="#E7C48A"/>
    ${star(120, 90, 16, "#FFE08A")}
    ${cloud(500, 90, 0.6)}`
  ),
  singStars: frame(
    "#EAF4FF",
    `<circle cx="180" cy="360" r="70" fill="#FFE08A"/>
    <rect x="168" y="180" width="16" height="190" rx="8" fill="#7EB0C8"/>
    <circle cx="400" cy="300" r="54" fill="#F7A8B8"/>
    <rect x="390" y="150" width="14" height="160" rx="7" fill="#7EB0C8"/>
    ${star(120, 120, 28, "#FFFFFF")}
    ${star(500, 140, 22, "#FFE08A")}
    ${star(520, 420, 16, "#B7E4C7")}
    ${cross(300, 120, 36, "#F4E2B4")}`
  ),
  hillCross: frame(
    "#D9F3FF",
    `${cloud(160, 130, 0.9)}
    ${cloud(430, 110, 0.7)}
    <circle cx="500" cy="200" r="36" fill="#FFE08A"/>
    <path d="M0 390 C160 300 260 430 400 360 C510 310 560 390 640 340 L640 640 L0 640 Z" fill="#B7E4C7"/>
    ${cross(320, 300, 78, "#FFF8E4")}
    ${star(80, 80, 14, "#FFFFFF")}
    ${star(220, 70, 10, "#FFE08A")}`
  ),
  cloudsStars: frame(
    "#D5EEFF",
    `${cloud(180, 220, 1.3)}
    ${cloud(430, 300, 1)}
    ${cloud(300, 420, 0.8)}
    ${star(90, 100, 22, "#FFE08A")}
    ${star(520, 90, 18, "#FFFFFF")}
    ${star(560, 200, 12, "#FFE08A")}
    ${star(80, 300, 12, "#FFFFFF")}
    ${cross(470, 470, 40, "#F4E2B4")}`
  ),
  nightStars: frame(
    "#1F4D73",
    `<circle cx="470" cy="150" r="54" fill="#FFE7A8"/>
    <circle cx="490" cy="140" r="48" fill="#1F4D73"/>
    ${star(120, 120, 26, "#FFE08A")}
    ${star(220, 200, 16, "#FFFFFF")}
    ${star(160, 300, 12, "#FFE08A")}
    ${star(340, 120, 14, "#FFFFFF")}
    ${star(300, 260, 22, "#FFE08A")}
    ${star(420, 320, 12, "#FFFFFF")}
    ${star(140, 450, 18, "#FFE08A")}
    ${cross(500, 470, 48, "#F4E2B4")}`
  ),
  starCard: frame(
    "#FFF8E8",
    `<rect x="150" y="90" width="340" height="420" rx="28" fill="#FFFFFF" stroke="#F3D7A1" stroke-width="8"/>
    ${star(320, 250, 70, "#FFE08A")}
    ${star(230, 160, 18, "#F7A8B8")}
    ${star(420, 170, 14, "#8ECAE6")}
    ${star(250, 360, 16, "#B7E4C7")}
    ${star(400, 380, 20, "#F7A8B8")}
    ${cross(320, 430, 36, "#F4E2B4")}`
  ),
  findStars: frame(
    "#E5F6EA",
    `<ellipse cx="160" cy="430" rx="120" ry="70" fill="#8FCB9B"/>
    <ellipse cx="330" cy="470" rx="140" ry="80" fill="#A9D8B4"/>
    <ellipse cx="500" cy="430" rx="110" ry="66" fill="#7FBF90"/>
    ${star(150, 250, 20, "#FFE08A")}
    ${star(300, 200, 16, "#FFFFFF")}
    ${star(470, 240, 22, "#FFE08A")}
    ${star(240, 340, 12, "#FFE08A")}
    ${star(400, 330, 14, "#FFFFFF")}
    ${cross(320, 110, 40, "#F4E2B4")}`
  ),
  starCircle: frame(
    "#FFF4D6",
    `${star(320, 120, 22, "#FFE08A")}
    ${star(470, 190, 18, "#F7A8B8")}
    ${star(520, 340, 20, "#8ECAE6")}
    ${star(430, 490, 16, "#B7E4C7")}
    ${star(210, 490, 18, "#F7A8B8")}
    ${star(120, 340, 20, "#8ECAE6")}
    ${star(170, 190, 16, "#FFE08A")}
    ${cross(320, 320, 84, "#F4E2B4")}`
  ),
  flyingDove: frame(
    "#D9F3FF",
    `${cloud(140, 150, 0.8)}
    ${cloud(480, 200, 0.7)}
    ${rainbow(320, 520, 180)}
    ${dove(300, 280, 1.35)}
    ${star(90, 80, 14, "#FFE08A")}
    ${star(560, 90, 12, "#FFFFFF")}`
  ),
  paperDove: frame(
    "#F4FBF4",
    `<rect x="80" y="300" width="480" height="200" rx="24" fill="#F3D7A1"/>
    <path d="M180 250 L320 180 L300 300 Z" fill="#FFFFFF" stroke="#D5E4EF" stroke-width="4"/>
    <path d="M320 180 L460 260 L300 300 Z" fill="#F7FBFF" stroke="#D5E4EF" stroke-width="4"/>
    <path d="M300 300 L340 250 L330 330 Z" fill="#F6C1A6"/>
    ${star(120, 120, 16, "#FFE08A")}
    ${cross(520, 130, 36, "#F4E2B4")}`
  ),
  kindWords: frame(
    "#FFF0F4",
    `<rect x="70" y="150" width="230" height="140" rx="28" fill="#FFFFFF"/>
    <path d="M120 290 L100 340 L170 290 Z" fill="#FFFFFF"/>
    <rect x="340" y="250" width="230" height="140" rx="28" fill="#FFFFFF"/>
    <path d="M500 390 L530 450 L450 390 Z" fill="#FFFFFF"/>
    ${cross(160, 210, 36, "#F4E2B4")}
    ${star(430, 310, 22, "#F7A8B8")}
    ${star(120, 80, 16, "#FFE08A")}
    ${star(540, 90, 14, "#8ECAE6")}`
  ),
  olive: frame(
    "#E7F7EA",
    `<path d="M140 470 C200 300 280 220 470 150" fill="none" stroke="#6EAE78" stroke-width="14" stroke-linecap="round"/>
    <ellipse cx="250" cy="340" rx="28" ry="16" fill="#8FCB9B" transform="rotate(-30 250 340)"/>
    <ellipse cx="310" cy="280" rx="28" ry="16" fill="#A9D8B4" transform="rotate(-40 310 280)"/>
    <ellipse cx="370" cy="230" rx="28" ry="16" fill="#8FCB9B" transform="rotate(-50 370 230)"/>
    <ellipse cx="250" cy="300" rx="28" ry="16" fill="#B7E4C7" transform="rotate(20 250 300)"/>
    <ellipse cx="330" cy="240" rx="26" ry="15" fill="#C9E8C3" transform="rotate(10 330 240)"/>
    ${cross(470, 420, 64, "#F4E2B4")}
    ${dove(150, 150, 0.7)}`
  ),
};
