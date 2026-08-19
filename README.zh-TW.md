# Vibe Coding Hub SEO Skills

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [Русский](README.ru.md)

網站：[vibecodinghub.org](https://vibecodinghub.org)

面向 Google、Bing 和 Yandex 第一方搜尋成效資料的隱私優先、唯讀 Agent Skills。

本儲存庫將可重複使用的 Agent Skills 與不含第三方相依套件的本機 Node.js CLI 結合使用。憑證和原始網站資料保留在使用者自己的裝置上；儲存庫不提供共用 OAuth Client、API Key、Token、網站識別碼或資料快照。

## 包含的 Skills

| Skill | 讀取的資料 | 主要輸出 |
| --- | --- | --- |
| [Google Search Console](skills/google-search-console/SKILL.md) | 網站資源、彙總成效、日期、搜尋查詢、頁面及搜尋查詢/頁面組合 | 包含權威彙總和 Top-row 證據的版本化 JSON 快照 |
| [Bing Webmaster Tools](skills/bing-webmaster-tools/SKILL.md) | 已驗證網站、流量、搜尋查詢、頁面、檢索健康狀態、檢索問題和 Sitemap | 包含本機日期範圍和 API 涵蓋範圍的版本化 JSON 快照 |
| [Yandex Webmaster](skills/yandex-webmaster/SKILL.md) | Host、彙總歷史、熱門搜尋查詢、裝置區隔和資料可用狀態 | 包含權威歷史彙總和熱門搜尋查詢的版本化 JSON 快照 |

與僅包含提示詞的 SEO 合集不同，這些 Skills 會從官方網站管理員平台 API 取得可重現的證據，在本機進行標準化處理，並保留每個平台自身的資料限制。

## 環境需求

- Node.js 22 或更新版本。CI 涵蓋 Node.js 22 和 24。
- 能夠存取待分析網站資源或 Host 的平台帳號。
- 使用者自己建立的平台憑證。設定說明請參閱[快速開始](#快速開始)。

## 安裝

安裝不會建立平台憑證。首次使用時，對應 Skill 會先執行 `doctor`，並在需要時引導使用者建立自己的平台憑證。請勿將金鑰、Secret 或 Token 貼到聊天中。

### Codex Plugin

```bash
codex plugin marketplace add wuxiangcoding/vibecodinghub-seo-skills --ref main
codex plugin add vibecodinghub-seo-skills@wuxiangcoding
```

安裝後建立新的 Codex 工作，然後呼叫 `$google-search-console` 等 Skill。

### Claude Code Plugin

在 Claude Code 中執行：

```text
/plugin marketplace add wuxiangcoding/vibecodinghub-seo-skills
/plugin install vibecodinghub-seo-skills@wuxiangcoding
```

Claude Code 會為 Plugin Skills 加上命名空間。直接呼叫時可使用 `/vibecodinghub-seo-skills:google-search-console`。

### 通用 Skills CLI

列出可用的 Skills：

```bash
npx skills add wuxiangcoding/vibecodinghub-seo-skills --list
```

為 Codex 或 Claude Code 全域安裝單一 Skill：

```bash
npx skills add wuxiangcoding/vibecodinghub-seo-skills \
  --skill google-search-console \
  --agent codex \
  --global
```

可以將 `codex` 替換為 `claude-code`，也可以選擇其他 Skill 名稱。

### 手動安裝單一 Skill

複製儲存庫後，只複製需要的 Skill：

```bash
mkdir -p "$HOME/.agents/skills"
cp -R skills/google-search-console "$HOME/.agents/skills/"
```

Codex 使用 `~/.agents/skills`；Claude Code 使用 `~/.claude/skills`。專案層級的安裝目錄分別為目標儲存庫中的 `.agents/skills` 和 `.claude/skills`。

## 快速開始

以下命令從本儲存庫根目錄執行。安裝到 Agent 後，Agent 會相對於各 Skill 的 `SKILL.md` 解析對應指令碼。

### Google Search Console

```bash
node skills/google-search-console/scripts/gsc.mjs doctor
node skills/google-search-console/scripts/gsc.mjs sites
node skills/google-search-console/scripts/gsc.mjs snapshot --site sc-domain:example.com --days 28
```

授權前，請先建立使用者自己的 Desktop OAuth Client。請參閱 [Google OAuth 設定](skills/google-search-console/references/oauth-setup.md)。

### Bing Webmaster Tools

```bash
node skills/bing-webmaster-tools/scripts/bing-webmaster.mjs doctor
node skills/bing-webmaster-tools/scripts/bing-webmaster.mjs sites
node skills/bing-webmaster-tools/scripts/bing-webmaster.mjs snapshot --site https://example.com/ --days 28
```

授權前，請先建立使用者自己的 API Key。請參閱 [Bing API Key 設定](skills/bing-webmaster-tools/references/api-key-setup.md)。

### Yandex Webmaster

```bash
node skills/yandex-webmaster/scripts/yandex-webmaster.mjs doctor
node skills/yandex-webmaster/scripts/yandex-webmaster.mjs hosts
node skills/yandex-webmaster/scripts/yandex-webmaster.mjs snapshot --host https:example.com:443 --days 28
```

授權前，請先建立使用者自己的 OAuth 應用程式。請參閱 [Yandex OAuth 設定](skills/yandex-webmaster/references/oauth-setup.md)。

## 輸出模型

每個成功產生的快照都會記錄資料來源、擷取時間、精確網站識別碼、要求期間、可用狀態、資料集完整性和標準化資料列。

- **彙總總量**來自各平台的權威彙總或時間序列資料集。
- **Top rows** 是排序後的搜尋查詢或頁面證據，並非完整資料集合，不能加總後作為整個網站的總量。
- **API 涵蓋範圍**描述平台實際傳回的日期；本機選擇的分析範圍不會擴大上游資料範圍。
- **結構化空狀態**表示資料無法使用或尚未載入，並不代表搜尋成效為零。

每個 Skill 都在 `references/` 中記錄準確的輸出結構和平台限制。

## 隱私與安全

- 憑證、Token、別名、網站識別碼、搜尋查詢、URL、指標、匯出檔案和快照必須保存在所有 Git 儲存庫之外。
- 在 macOS 和 Linux 上，本機憑證檔案僅允許檔案擁有者存取（`0600`）。
- 原始資料列預設保存在儲存庫外，只有命令明確支援且使用者主動選擇時才會輸出。
- 所有 API 操作均為唯讀。Bing Skill 刻意不提供 URL 或 Sitemap 提交命令。
- CI 僅使用模擬回應，不需要真實的平台憑證。

如需私下回報安全問題，請參閱 [SECURITY.md](SECURITY.md)。

## 更新與移除

Codex：

```bash
codex plugin marketplace upgrade wuxiangcoding
codex plugin add vibecodinghub-seo-skills@wuxiangcoding
codex plugin remove vibecodinghub-seo-skills@wuxiangcoding
```

Claude Code 可使用 `/plugin marketplace update wuxiangcoding`、`/plugin update vibecodinghub-seo-skills@wuxiangcoding` 或 `/plugin uninstall vibecodinghub-seo-skills@wuxiangcoding`。

移除 Plugin 不會刪除使用者自行管理的設定目錄和資料目錄中的憑證或快照。

## 開發

```bash
npm run check
npm test
```

貢獻和驗證需求請參閱 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 授權條款

本專案採用 [Apache License 2.0](LICENSE)。
