# 每日晨報

這是一個手機網頁 App，每天台北時間早上 7:00 自動更新美股、台股和財經資訊。

- **美股**：四大指數、熱門個股、台股 ADR（含折溢價）
- **台股**：加權指數、台指期夜盤、三大法人買賣超與未平倉（都有每日明細）、投本比和外本比前 10 名
- **資訊**：財經新聞、近期法說會、配息、股票分割、申購抽籤
- **詳情頁**：每檔都能點進去看當日走勢、日／週／月／年 K（可點 K 棒看資料、左右拖曳看更早）、前高、成交量（今日、5 日均量、10 日均量）、近一年高低與報酬率

全部用 GitHub 免費功能運作：GitHub Actions 負責每天抓資料，GitHub Pages 負責放網頁。

## 設定步驟（約 10 分鐘）

1. **建立 repository**
   登入 GitHub，右上角「+」→「New repository」。名稱填 `morning-report`，選 **Public**（免費帳號的 Pages 需要公開），按「Create repository」。

2. **上傳檔案**
   在新 repository 頁面點「uploading an existing file」，把解壓縮後 `morning-report` 資料夾**裡面的所有內容**拖進去，按「Commit changes」。
   > 注意：`.github` 是隱藏資料夾，Mac 請在 Finder 按 `Cmd + Shift + .` 顯示後再一起拖曳。上傳後確認 repository 裡有 `.github/workflows/daily.yml`。

3. **允許 Actions 寫入**
   repository 的「Settings」→「Actions」→「General」→ 最下方「Workflow permissions」選 **Read and write permissions** → Save。

4. **第一次抓資料**
   「Actions」分頁 → 左邊點「每日晨報資料更新」→ 右邊「Run workflow」→ 綠色「Run workflow」。
   第一次會補抓歷史資料，大約 10～20 分鐘。完成後是綠色勾勾。

5. **開啟網頁**
   「Settings」→「Pages」→「Build and deployment」的 Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾選 `/docs` → Save。
   等 1～2 分鐘，頁面上方會出現網址，例如 `https://你的帳號.github.io/morning-report/`。

6. **加到手機主畫面**
   - iPhone：用 Safari 打開網址 → 分享按鈕 →「加入主畫面」
   - Android：用 Chrome 打開 → 右上選單 →「加到主畫面」

之後每天早上 7:00 左右會自動更新（GitHub 的排程偶爾會延遲 10～30 分鐘）。想立刻更新，就重做第 4 步。

## 自訂

修改 `config.json` 就能調整：

| 欄位 | 用途 |
|---|---|
| `us_hot` | 熱門個股候選清單，依成交值取前 `us_hot_show` 名 |
| `adrs` | ADR 與對應台股代號、ADR 換算比例 |
| `us_dividend_watch` | 美股配息追蹤清單 |
| `split_watch` | 股票分割追蹤清單 |
| `news_feeds` | 新聞 RSS 來源，`cat` 可填 `TW`、`US`、`MAC` |
| `ratio_days`、`ratio_top` | 投本比、外本比的計算天數與名次數 |

## 資料來源與限制

| 區塊 | 來源 |
|---|---|
| 美股、ADR、K 線、加權指數、個股走勢、分割、美股配息 | Yahoo Finance（透過 yfinance 套件） |
| 夜盤、未平倉 | 期交所 OpenAPI 與每日行情下載 |
| 三大法人、投本比、外本比、台股配息、申購抽籤 | 證交所公開資料 |
| 法說會 | 公開資訊觀測站 |
| 新聞 | Yahoo 股市、Google 新聞 RSS |

- 報價都是收盤資料，不是即時報價。
- 夜盤沒有免費的分時資料，只有每日 K 線。
- 投本比、外本比只計算上市股票。
- 股票分割只有追蹤清單內的股票，而且只看得到已生效的分割。
- 某個來源抓不到時，其他區塊照常更新，App 的「設定」頁會列出哪個來源異常。

僅供參考，不構成投資建議。
