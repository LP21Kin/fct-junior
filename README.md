# 福泉堂 初級團

呢個網站俾初級團家長睇：每週聚會做過啲咩、金句、重點、相片同代禱。

成個網頁同埋所有相片都會加密。冇密碼嘅人，只會見到一個輸入密碼嘅頁面。

試用階段會先顯示**假文字同圖畫**，方便睇版面。黃色提示會寫明「試用示範」。接上真正內容之後，提示會消失。

家長網址（合併同設定完成之後先會出現）：

https://lp21kin.github.io/fct-junior/

## 家長點樣睇

1. 打開上面個網址。
2. 輸入同工私下話你知嘅密碼。
3. 可以剔選 **記住密碼**。呢部裝置大約半年內會自動打開。
4. 如果係共用電話，可以唔剔。
5. 入到去之後，最底有個掣可以「清除呢部裝置記住咗嘅密碼」。

密碼唔好寫喺 GitHub，亦都唔好放喺網址入面。用口頭或者私人訊息話俾家長知就得。

## 你要做嘅一次性設定

請跟順序做。未做完之前，網站不會公開內容。

### 1. 設定密碼

1. 打開本專案 GitHub 頁。
2. 撳 **Settings**。
3. 左邊撳 **Secrets and variables** → **Actions**。
4. 撳 **New repository secret**。
5. Name 填：`SITE_PASSWORD`
6. Secret 填你自己定嘅密碼。建議 **16 個字以上**，混雜文字同數字，唔好用生日或者 `password`。
7. 撳 **Add secret**。

密碼只放喺呢度。唔好寫入任何檔案，亦都唔好貼上 pull request。

如果冇呢個 secret，發佈會失敗，不會把未加密嘅網頁或者相片公開。

### 2. 合併呢個 pull request

撳 **Merge**。唔好直接改 `main`。

### 3. 設定 GitHub Pages

1. 仍然喺 **Settings**。
2. 左邊撳 **Pages**。
3. **Build and deployment** → **Source** 揀 **GitHub Actions**。

### 4. 等發佈完成

1. 撳上面 **Actions**。
2. 打開「發佈加密網站」。
3. 如果因為 Pages 未設定好而失敗，做完第 3 步之後撳 **Re-run jobs**。
4. 全部綠色之後，打開 https://lp21kin.github.io/fct-junior/ 試下密碼。

如果 GitHub 話要批准 environment，撳批准就得。

## 每週點樣放相片（好重要）

呢個 `fct-junior` 專案係**公開**嘅。任何人都可以睇到裡面嘅檔案。

所以：

- **唔好**把小朋友相片拖入呢個專案。
- **唔好**把每週嘅 `week.json` 直接 commit 上嚟。
- 程式會拒絕已經追蹤嘅 jpg、png、webp、heic 等圖片。一旦放咗入公開專案，就算之後刪除，舊紀錄都可能仲喺度。

真正嘅文字同相片，請放喺一個**私人專案**。個人 GitHub 帳號可以免費開私人專案，唔使付費。

### 開私人專案（只需做一次）

1. GitHub 右上角 **+** → **New repository**。
2. 名稱可以叫 `fct-junior-content`。
3. 揀 **Private**。唔好揀 Public。
4. 撳 **Create repository**。
5. 可以將本專案 `templates/private-content-repo` 入面嘅檔案上傳去私人專案，當示例。示例未改好之前，網站不會用佢發佈。

### 俾公開網站讀取私人專案（只需做一次）

1. 右上角頭像 → **Settings**。
2. 最底 **Developer settings**。
3. **Personal access tokens** → **Fine-grained tokens** → **Generate new token**。
4. 名稱例如：`讀初級團內容`。
5. Expiration 可以揀 90 日。到期要再做一次，否則更新會失敗。
6. **Repository access** 揀 **Only select repositories**，然後只揀 `fct-junior-content`。
7. **Permissions** → **Contents** 揀 **Read-only**。其他唔使開。
8. 產生之後，複製嗰串 token。呢頁關閉就唔會再顯示。
9. 返去公開專案 `fct-junior` → **Settings** → **Secrets and variables** → **Actions**。
10. 新增 secret：
    - 名稱 `CONTENT_REPO`，內容係 `你的帳號/fct-junior-content`（例如 `LP21Kin/fct-junior-content`）
    - 名稱 `CONTENT_READ_TOKEN`，內容係頭先複製嘅 token

### 每個星期

1. 揀大約 **10 至 20 張**相。唔好包含全名、學校、地址、電話。
2. 檔名改成 `01.jpg`、`02.jpg`。唔好用小朋友個名做檔名。
3. iPhone 如果可以，上載前揀「最相容」或者 JPEG。HEIC 多數都得；如果失敗，Actions 會叫你轉做 JPEG。
4. 打開私人專案。
5. **Add file** → **Create new file**。
6. 檔名輸入 `weeks/2026-10-11/week.json`（日期改成當日）。
7. 貼上下面嘅格式，改好文字，然後 commit。
8. 撳入去 `weeks/2026-10-11/` 呢個資料夾。
9. **Add file** → **Upload files**，上傳 `01.jpg`、`02.jpg`……如果一次上傳失敗，可以分兩次，每次約 10 張。
10. 返去改 `week.json` 嘅 `photos`，令檔名同說明對得上。
11. 去公開專案 **Actions** → **發佈加密網站** → **Run workflow**。
12. 幾分鐘後重新打開網站，就會見到新嘅一週。

未設定 `CONTENT_REPO` 之前，網站會繼續用假示範。設定好而且 Run workflow 成功之後，就會改用私人倉嘅內容。

### week.json 格式

```json
{
  "date": "2026-10-11",
  "title": "喺度寫今次主題",
  "themeColor": "#A9D4F5",
  "memoryVerse": "喺度寫金句",
  "verseRef": "創世記 1:1",
  "points": ["重點一", "重點二"],
  "prayers": ["代禱一"],
  "photos": [
    { "file": "01.jpg", "caption": "簡短說明，唔好寫全名" }
  ]
}
```

- `date`：`2026-10-11` 呢種寫法。網站會由新到舊排列。
- `title`：今次主題。
- `themeColor`：今次主題色，用 `#` 加 6 個色碼。
- `memoryVerse`：金句。`verseRef`：出處。
- `points`：重點，至少一項。
- `prayers`：代禱。頁面只顯示**最新一週**嘅代禱。
- `photos`：可以留 `[]`。有相片就寫檔名同說明。說明盡量短，大約 24 個字以內。
- 相片可以放喺 `weeks/日期/`，或者放喺 `weeks/日期/photos/`。用 GitHub 網頁上傳，放喺日期資料夾最方便。

可以用嘅主題色例子：

| 顏色 | 色碼 |
| --- | --- |
| 粉藍 | `#A9D4F5` |
| 粉黃 | `#FFE7A3` |
| 粉綠 | `#C9E8C3` |
| 粉橙 | `#FFD0B5` |
| 粉紫 | `#E3D4F5` |

### 相片會自動變細

發佈時會自動將每張相壓縮到大約 **200–300KB**，再嵌進網頁，然後先加密。原本嘅大相只留喺私人專案。

壓縮時會去掉相片入面嘅拍攝位置等隱藏資料。

20 張相左右，第一下打開可能要等幾秒，屬正常。

私人專案會慢慢變大。如果 GitHub 話太大，可以刪走已經很久、而且你唔需要再改嘅舊週次。注意：刪走之後，下次發佈就不會再顯示那幾週。

### 可選：改完私人倉就自動更新

平常撳 **Run workflow** 就夠。如果你想私人倉一有更新就自動發佈，可以將 `templates/private-content-repo/.github/workflows/notify-public-site.yml` 一併放進私人專案，再另外做一個有權限啟動公開專案 Actions 嘅 token，secret 名稱叫 `PUBLIC_SITE_TOKEN`。呢步可以以後先做。

## 點樣加密

1. GitHub Actions 用 `SITE_PASSWORD` 做密碼。
2. 程式將每週文字同相片（相片先變成網頁入面嘅資料）合成一個頁面。
3. [StatiCrypt](https://github.com/robinmoisson/staticrypt) 用 AES-256 加密成個頁面。
4. 公開出嚟嘅只係密碼頁。正確密碼先會喺家長自己嘅瀏覽器入面解開。
5. 自動檢查會睇輸出有冇明文、金句、主題或者圖片檔。有的話就停止，不會發佈。

密碼頁上面嘅小圖（彩虹、星星、白鴿）只係裝飾，不是聚會相片。

## 試用示範

未接上私人倉時，網站用三個假週次：彩虹、星星、白鴿。圖畫係程式畫嘅，不是真人相片。

呢啲假文字寫喺 `src/demo-weeks.mjs`，所以讀程式碼嘅人睇到。呢個只係試版。**真週次唔好寫入呢個檔案。**

## 進階：喺自己電腦試睇

平常更新唔使做呢步。

```bash
npm ci
SITE_PASSWORD='你自己嘅測試密碼' npm run build
npm run verify
npx serve dist
```

測試密碼只放喺呢一下指令，唔好寫入檔案，亦都唔好 commit。然後用瀏覽器打開終端機顯示嘅本機網址。

## 限制（請知道）

- 密碼頁係公開嘅，但頁面入面嘅聚會內容同相片不是。
- 密碼如果太短，懂技術嘅人可以慢慢試。請用長密碼。
- 「記住密碼」會留喺該部裝置。共用裝置請不要剔，或者用完清除。
- 真相片不能安全地直接放喺呢個公開專案。要嘛用上面嘅免費私人專案，要嘛另找一個只有同工能夠進入的地方。沒有第三個又安全又可以 commit 上嚟的做法。
- 這個網站沒有伺服器帳號系統。知道密碼的人就睇到全部週次。密碼只應交給家長同同工。
