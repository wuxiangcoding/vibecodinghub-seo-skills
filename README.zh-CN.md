# Vibe Coding Hub SEO Skills

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [Русский](README.ru.md)

网站：[vibecodinghub.org](https://vibecodinghub.org)

面向 Google、Bing 和 Yandex 第一方搜索表现数据的隐私优先、只读 Agent Skills。

本仓库将可复用的 Agent Skills 与无第三方依赖的本地 Node.js CLI 结合使用。凭据和原始网站数据保留在用户自己的设备上；仓库不提供共享 OAuth Client、API Key、Token、站点标识或数据快照。

## 包含的 Skills

| Skill | 读取的数据 | 主要输出 |
| --- | --- | --- |
| [Google Search Console](skills/google-search-console/SKILL.md) | 站点资源、汇总表现、日期、查询词、页面及查询词/页面组合 | 包含权威汇总和 Top-row 证据的版本化 JSON 快照 |
| [Bing Webmaster Tools](skills/bing-webmaster-tools/SKILL.md) | 已验证站点、流量、查询词、页面、抓取健康、抓取问题和 Sitemap | 包含本地日期窗口和 API 覆盖范围的版本化 JSON 快照 |
| [Yandex Webmaster](skills/yandex-webmaster/SKILL.md) | Host、汇总历史、热门查询、设备分段和数据可用状态 | 包含权威历史汇总和热门查询的版本化 JSON 快照 |

与只包含提示词的 SEO 合集不同，这些 Skills 会从官方站长平台 API 获取可复现证据，在本地进行标准化处理，并保留每个平台自身的数据限制。

## 环境要求

- Node.js 22 或更高版本。CI 覆盖 Node.js 22 和 24。
- 能够访问待分析站点资源或 Host 的平台账号。
- 用户自己创建的平台凭据。配置说明见[快速开始](#快速开始)。

## 安装

仓库在 `v0.1.0` 加固阶段保持私有。公开前，使用 Marketplace 安装需要相应的 GitHub 访问权限。

### Codex Plugin

```bash
codex plugin marketplace add wuxiangcoding/vibecodinghub-seo-skills --ref main
codex plugin add vibecodinghub-seo-skills@wuxiangcoding
```

安装后新建一个 Codex 任务，然后调用 `$google-search-console` 等 Skill。

### Claude Code Plugin

在 Claude Code 中运行：

```text
/plugin marketplace add wuxiangcoding/vibecodinghub-seo-skills
/plugin install vibecodinghub-seo-skills@wuxiangcoding
```

Claude Code 会为 Plugin Skills 添加命名空间。直接调用时可使用 `/vibecodinghub-seo-skills:google-search-console`。

### 通用 Skills CLI

列出可用 Skills：

```bash
npx skills add wuxiangcoding/vibecodinghub-seo-skills --list
```

为 Codex 或 Claude Code 全局安装单个 Skill：

```bash
npx skills add wuxiangcoding/vibecodinghub-seo-skills \
  --skill google-search-console \
  --agent codex \
  --global
```

可以将 `codex` 替换为 `claude-code`，也可以选择其他 Skill 名称。

### 手动安装单个 Skill

克隆仓库后，只复制需要的 Skill：

```bash
mkdir -p "$HOME/.agents/skills"
cp -R skills/google-search-console "$HOME/.agents/skills/"
```

Codex 使用 `~/.agents/skills`；Claude Code 使用 `~/.claude/skills`。项目级安装目录分别为目标仓库中的 `.agents/skills` 和 `.claude/skills`。

## 快速开始

以下命令从本仓库根目录运行。安装到 Agent 后，Agent 会相对于各 Skill 的 `SKILL.md` 解析对应脚本。

### Google Search Console

```bash
node skills/google-search-console/scripts/gsc.mjs doctor
node skills/google-search-console/scripts/gsc.mjs sites
node skills/google-search-console/scripts/gsc.mjs snapshot --site sc-domain:example.com --days 28
```

授权前，请先创建用户自己的 Desktop OAuth Client。参阅 [Google OAuth 配置](skills/google-search-console/references/oauth-setup.md)。

### Bing Webmaster Tools

```bash
node skills/bing-webmaster-tools/scripts/bing-webmaster.mjs doctor
node skills/bing-webmaster-tools/scripts/bing-webmaster.mjs sites
node skills/bing-webmaster-tools/scripts/bing-webmaster.mjs snapshot --site https://example.com/ --days 28
```

授权前，请先创建用户自己的 API Key。参阅 [Bing API Key 配置](skills/bing-webmaster-tools/references/api-key-setup.md)。

### Yandex Webmaster

```bash
node skills/yandex-webmaster/scripts/yandex-webmaster.mjs doctor
node skills/yandex-webmaster/scripts/yandex-webmaster.mjs hosts
node skills/yandex-webmaster/scripts/yandex-webmaster.mjs snapshot --host https:example.com:443 --days 28
```

授权前，请先创建用户自己的 OAuth 应用。参阅 [Yandex OAuth 配置](skills/yandex-webmaster/references/oauth-setup.md)。

## 输出模型

每个成功生成的快照都会记录数据来源、获取时间、精确站点标识、请求周期、可用状态、数据集完整性和标准化数据行。

- **汇总总量**来自各平台的权威汇总或时间序列数据集。
- **Top rows** 是排序后的查询词或页面证据，并非完整数据集合，不能相加后作为站点总量。
- **API 覆盖范围**描述平台实际返回的日期；本地选择分析窗口不会扩大上游数据范围。
- **结构化空状态**表示数据不可用或尚未加载，并不证明搜索表现为零。

每个 Skill 都在 `references/` 中记录了准确的输出结构和平台限制。

## 隐私与安全

- 凭据、Token、别名、站点标识、查询词、URL、指标、导出文件和快照必须保存在所有 Git 仓库之外。
- 在 macOS 和 Linux 上，本地凭据文件仅允许文件所有者访问（`0600`）。
- 原始数据行默认保存在仓库外，只有命令明确支持且用户主动选择时才会打印。
- 所有 API 操作均为只读。Bing Skill 有意不提供 URL 或 Sitemap 提交命令。
- CI 只使用模拟响应，不需要真实平台凭据。

私密报告安全问题请参阅 [SECURITY.md](SECURITY.md)。

## 更新与移除

Codex：

```bash
codex plugin marketplace upgrade wuxiangcoding
codex plugin add vibecodinghub-seo-skills@wuxiangcoding
codex plugin remove vibecodinghub-seo-skills@wuxiangcoding
```

Claude Code 可使用 `/plugin marketplace update wuxiangcoding`、`/plugin update vibecodinghub-seo-skills@wuxiangcoding` 或 `/plugin uninstall vibecodinghub-seo-skills@wuxiangcoding`。

移除 Plugin 不会删除用户自行管理的配置目录和数据目录中的凭据或快照。

## 开发

```bash
npm run check
npm test
```

贡献和验证要求参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

本项目使用 [Apache License 2.0](LICENSE)。
