// 試用示範內容（假的）。
// 真正每週內容同相片唔好寫喺呢度，亦都唔好 commit 上呢個公開專案。
import { demoArt } from "./demo-art.mjs";

function photos(items) {
  return items.map(([key, caption], index) => ({
    file: `${String(index + 1).padStart(2, "0")}.svg`,
    caption,
    svg: demoArt[key],
  }));
}

export const demoWeeks = [
  {
    date: "2026-10-04",
    title: "彩虹嘅應許",
    themeColor: "#7EC8E3",
    memoryVerse: "我把彩虹放在雲彩中，這就可作我與地立約的記號了。",
    verseRef: "創世記 9:13",
    points: ["用彩虹記住上帝嘅應許", "聽故事、唱詩、做手作", "上帝說話算數，唔會忘記我哋"],
    prayers: [
      "求主保守初級團嘅小朋友平安健康",
      "求主幫助屋企人一齊溫習金句",
      "為聚會可以開開心心代禱",
    ],
    photos: photos([
      ["rainbowSky", "天上嘅彩虹"],
      ["rainbowCraft", "彩虹手作"],
      ["storyBook", "故事時間"],
      ["singStars", "一齊唱詩"],
      ["hillCross", "小山同十字架"],
      ["cloudsStars", "白雲同星星"],
    ]),
  },
  {
    date: "2026-09-27",
    title: "小星星讚美",
    themeColor: "#F6D56B",
    memoryVerse: "你們要讚美耶和華！",
    verseRef: "詩篇 113:1",
    points: ["星星提醒我哋讚美上帝", "一齊做星星卡", "遊戲入面學習輪流同分享"],
    prayers: ["求主俾小朋友樂於讚美", "為初級團嘅帶領團隊代禱"],
    photos: photos([
      ["nightStars", "星星夜空"],
      ["starCard", "星星卡手作"],
      ["findStars", "搵星星遊戲"],
      ["starCircle", "星星圍住十字架"],
    ]),
  },
  {
    date: "2026-09-20",
    title: "和平白鴿",
    themeColor: "#8FCB9B",
    memoryVerse: "使人和睦的人有福了！",
    verseRef: "馬太福音 5:9",
    points: ["白鴿提醒我哋要和睦", "學習用好說話鼓勵人", "一齊摺紙同祈禱"],
    prayers: ["求主幫助小朋友彼此和睦", "為每個家庭有平安代禱"],
    photos: photos([
      ["flyingDove", "飛翔嘅白鴿"],
      ["paperDove", "摺紙白鴿"],
      ["kindWords", "溫柔嘅說話"],
      ["olive", "橄欖枝"],
    ]),
  },
];
