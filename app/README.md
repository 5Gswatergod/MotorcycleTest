# RideReady 台灣機車筆試

以 React + TypeScript 實作的本機機車駕照模擬考與隨機練習。正式考卷採 115 年 1 月 30 日新制：50 題、30 分鐘、每題 2 分、85 分及格。

## 啟動

```powershell
npm install
npm run dev -- --host 0.0.0.0
```

啟動後終端機會同時顯示本機網址與區域網路網址；同一 Wi-Fi／LAN 的裝置可使用 Network 網址開啟。

## 題庫重新產生

三份穩定命名的來源 PDF 保存在 `source-pdfs/`。先安裝 Python 依賴，再執行產生器與稽核：

```powershell
python -m pip install -r scripts/requirements.txt
npm run generate:data
npm run audit:data
python scripts/audit_question_bank.py --network
```

產生器輸出 `public/data/question-bank.json`、148 個一般題圖片與 120 個情境題圖片。題庫總數固定稽核為 806 一般題、120 情境圖片題、126 影片題，共 1,052 題。

## 驗證

```powershell
npm run typecheck
npm run test
npm run test:sites
npm run build
```

學習紀錄以 `motorcycle-test:` 命名空間保存在瀏覽器 localStorage，沒有帳號、伺服器資料庫或外部同步。可在首頁匯出／匯入 JSON 備份。

## GitHub Pages

Repository 內含 `.github/workflows/deploy-pages.yml`。推送至 `main` 後會自動執行型別檢查、測試、正式建置並部署 `dist/client`。第一次使用時，請至 GitHub 的 **Settings → Pages → Build and deployment**，確認 Source 為 **GitHub Actions**。
