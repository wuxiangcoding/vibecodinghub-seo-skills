# Vibe Coding Hub SEO Skills

Privacy-first, read-only agent skills for analyzing first-party search performance across Google, Bing, and Yandex.

The repository combines reusable Agent Skills with dependency-free local Node.js CLIs. Credentials and raw website data stay on the user's machine; the repository ships no shared OAuth client, API key, token, property identifier, or snapshot.

## Included skills

| Skill | What it reads | Primary output |
| --- | --- | --- |
| [Google Search Console](skills/google-search-console/SKILL.md) | Properties, aggregate performance, dates, queries, pages, and query/page pairs | Versioned JSON snapshots with aggregate totals and Top-row evidence |
| [Bing Webmaster Tools](skills/bing-webmaster-tools/SKILL.md) | Verified sites, traffic, queries, pages, crawl health, crawl issues, and sitemaps | Versioned JSON snapshots with local date windows and API coverage |
| [Yandex Webmaster](skills/yandex-webmaster/SKILL.md) | Hosts, aggregate history, popular queries, device segments, and availability states | Versioned JSON snapshots with authoritative history totals and Top queries |

Unlike prompt-only SEO collections, these skills retrieve reproducible evidence from official webmaster APIs, normalize it locally, and preserve the data limitations of each source.

## Requirements

- Node.js 22 or newer. CI covers Node.js 22 and 24.
- An account with access to the properties or hosts being analyzed.
- User-owned provider credentials. Setup details are linked in [Quick start](#quick-start).

## Install

The repository is private during the `v0.1.0` hardening phase. Marketplace installation requires GitHub access until the repository is made public.

### Codex plugin

```bash
codex plugin marketplace add wuxiangcoding/vibecodinghub-seo-skills --ref main
codex plugin add vibecodinghub-seo-skills@wuxiangcoding-seo
```

Start a new Codex task after installation, then invoke a skill such as `$google-search-console`.

### Claude Code plugin

Run these commands inside Claude Code:

```text
/plugin marketplace add wuxiangcoding/vibecodinghub-seo-skills
/plugin install vibecodinghub-seo-skills@wuxiangcoding-seo
```

Claude Code namespaces plugin skills. For example, use `/vibecodinghub-seo-skills:google-search-console` when invoking the skill directly.

### Universal skills CLI

List the available skills:

```bash
npx skills add wuxiangcoding/vibecodinghub-seo-skills --list
```

Install one skill globally for Codex or Claude Code:

```bash
npx skills add wuxiangcoding/vibecodinghub-seo-skills \
  --skill google-search-console \
  --agent codex \
  --global
```

Replace `codex` with `claude-code`, or choose a different skill name.

### Manual single-skill install

After cloning the repository, copy only the skill you need:

```bash
mkdir -p "$HOME/.agents/skills"
cp -R skills/google-search-console "$HOME/.agents/skills/"
```

Codex uses `~/.agents/skills`; Claude Code uses `~/.claude/skills`. Project-level installs use `.agents/skills` or `.claude/skills` in the target repository.

## Quick start

Run commands from this repository checkout. Installed agents resolve the same scripts relative to each skill's `SKILL.md`.

### Google Search Console

```bash
node skills/google-search-console/scripts/gsc.mjs doctor
node skills/google-search-console/scripts/gsc.mjs sites
node skills/google-search-console/scripts/gsc.mjs snapshot --site sc-domain:example.com --days 28
```

Create a user-owned Desktop OAuth client before authorization. See [Google OAuth setup](skills/google-search-console/references/oauth-setup.md).

### Bing Webmaster Tools

```bash
node skills/bing-webmaster-tools/scripts/bing-webmaster.mjs doctor
node skills/bing-webmaster-tools/scripts/bing-webmaster.mjs sites
node skills/bing-webmaster-tools/scripts/bing-webmaster.mjs snapshot --site https://example.com/ --days 28
```

Create a user-owned API key before authorization. See [Bing API key setup](skills/bing-webmaster-tools/references/api-key-setup.md).

### Yandex Webmaster

```bash
node skills/yandex-webmaster/scripts/yandex-webmaster.mjs doctor
node skills/yandex-webmaster/scripts/yandex-webmaster.mjs hosts
node skills/yandex-webmaster/scripts/yandex-webmaster.mjs snapshot --host https:example.com:443 --days 28
```

Create a user-owned OAuth application before authorization. See [Yandex OAuth setup](skills/yandex-webmaster/references/oauth-setup.md).

## Output model

Every successful snapshot records its source, fetch time, exact property identity, requested period, availability state, dataset completeness, and normalized rows.

- **Aggregate totals** come from each platform's authoritative summary or time-series dataset.
- **Top rows** are ranked query or page evidence. They are not a complete census and must not be summed as property-wide totals.
- **API coverage** describes dates returned by a provider. A locally selected analysis window does not expand upstream coverage.
- **Structured empty states** describe unavailable or not-yet-loaded data; they do not prove zero performance.

Each skill documents its exact schema and platform-specific limits under `references/`.

## Privacy and security

- Credentials, tokens, aliases, site identifiers, queries, URLs, metrics, exports, and snapshots must stay outside every Git repository.
- Local credential files use owner-only permissions (`0600`) on macOS and Linux.
- Raw rows are saved outside the repository by default and are not printed unless a command explicitly supports and receives an opt-in flag.
- API operations are read-only. The Bing skill intentionally omits URL and sitemap submission commands.
- CI uses mock responses and never requires real provider credentials.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## Update and remove

For Codex:

```bash
codex plugin marketplace upgrade wuxiangcoding-seo
codex plugin add vibecodinghub-seo-skills@wuxiangcoding-seo
codex plugin remove vibecodinghub-seo-skills@wuxiangcoding-seo
```

For Claude Code, use `/plugin marketplace update wuxiangcoding-seo`, `/plugin update vibecodinghub-seo-skills@wuxiangcoding-seo`, or `/plugin uninstall vibecodinghub-seo-skills@wuxiangcoding-seo`.

Removing the plugin does not delete credentials or snapshots from the user-controlled config and data directories.

## Development

```bash
npm run check
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution and validation requirements.

## License

Licensed under the [Apache License 2.0](LICENSE).
