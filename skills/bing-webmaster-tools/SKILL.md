---
name: bing-webmaster-tools
description: Fetch, normalize, cache, and inspect Bing Webmaster Tools performance and crawl data through the API-key JSON API. Use when Codex needs to authenticate a local Bing Webmaster integration, list verified sites, analyze clicks, impressions, CTR, positions, queries, pages, crawl health, crawl issues, or sitemaps, drill into query-to-page or page-to-query mappings, or provide reproducible Bing evidence to SEO automations.
---

# Bing Webmaster Tools

## Overview

Use the bundled dependency-free Node.js CLI for every Bing Webmaster Tools API operation. This skill is read-only and supports site discovery, search performance, crawl health, sitemap state, candidate drill-downs, and reproducible JSON snapshots.

## Privacy model

Require each user to create their own Bing Webmaster API key; never distribute a shared key with this skill. Keep credentials, aliases, site lists, and snapshots outside repositories under `~/.config/codex-bing-webmaster` and `~/.local/share/codex-bing-webmaster` by default. Treat site identifiers, queries, URLs, crawl details, and metrics as private business data.

## Requirements

- Node.js 22 or newer.
- A Bing Webmaster Tools account with verified sites.
- A user-owned Bing Webmaster API key.

## Setup

Resolve `SKILL_DIR` to the absolute directory containing this `SKILL.md`; do not assume the user's current working directory is the skill directory. Run commands as `node "$SKILL_DIR/scripts/bing-webmaster.mjs" ...`.

Read [references/api-key-setup.md](references/api-key-setup.md), then run:

```bash
node "$SKILL_DIR/scripts/bing-webmaster.mjs" doctor
node "$SKILL_DIR/scripts/bing-webmaster.mjs" auth
```

## Workflow

1. Always run `node "$SKILL_DIR/scripts/bing-webmaster.mjs" doctor` before querying.
2. If `ready` is false, do not run data commands. Read [references/api-key-setup.md](references/api-key-setup.md), explain each reported blocker, and guide the user through creating their own Bing Webmaster API key. Never ask the user to paste the key into chat or place it in a command line.
3. Pause while the user completes the Bing Webmaster steps. After they confirm the key exists, run `node "$SKILL_DIR/scripts/bing-webmaster.mjs" auth` in an interactive terminal, rerun `doctor`, and require `ready: true`. For a pre-set environment secret, use `auth --from-env`. Never create a key for the user, reuse another person's key, or start interactive authorization from unattended automation.
4. Save the private site list outside repositories, then read it and preserve the exact site URL returned by Bing:

   `node "$SKILL_DIR/scripts/bing-webmaster.mjs" sites --output ~/.local/share/codex-bing-webmaster/site-list.json`
5. Add a stable alias when useful: `node "$SKILL_DIR/scripts/bing-webmaster.mjs" alias --name example --site https://example.com/`.
6. For repeatable analysis, prefer a snapshot:

   `node "$SKILL_DIR/scripts/bing-webmaster.mjs" snapshot --site example --days 28`

7. Read the emitted snapshot path and report its `source`, `fetchedAt`, exact site, selected window, API coverage, freshness, and row counts. Read [references/output-schema.md](references/output-schema.md) before interpreting or transforming snapshot data.
8. For intent-to-landing-page evidence, drill into only a few shortlisted candidates:

   `node "$SKILL_DIR/scripts/bing-webmaster.mjs" query --site example --dataset query-pages --query "example review"`

## Commands

- `doctor`: inspect API-key, alias, and snapshot readiness without revealing secrets.
- `auth`: securely capture and validate a Bing Webmaster API key, then save it with mode `0600`.
- `sites`: list accessible sites and verification state; prefer `--output` to a path outside repositories. Use `--stdout` only when the user explicitly accepts that private site identifiers may enter terminal or automation logs.
- `alias`: save a local alias for an exact Bing site URL.
- `query`: fetch one raw dataset; prefer `--output` to a path outside repositories. Use `--stdout` only when the user explicitly accepts that search queries, page URLs, and metrics may enter logs.
- `snapshot`: fetch performance and health sources, apply one locally derived date window, aggregate query/page rows, and save a versioned JSON snapshot.
- `latest`: locate the last successful local snapshot for a site.
- `self-test`: validate response normalization, date parsing, windowing, and aggregation without network access.

Run `node "$SKILL_DIR/scripts/bing-webmaster.mjs" help` for complete flags. Read [references/api-contract.md](references/api-contract.md) when adding endpoints, changing authentication, or diagnosing response drift. Read [references/automation-guidance.md](references/automation-guidance.md) before drafting or revising a Bing SEO automation.

## Output

Snapshots record the exact site, local window, upstream API coverage, freshness, normalized datasets, row counts, and completeness. Use `summary` for authoritative totals. Read [references/output-schema.md](references/output-schema.md) before interpreting or transforming snapshot data.

## Data limitations

- Treat `traffic` as the authoritative property-level clicks and impressions time series. Use snapshot `summary` for totals; never sum query or page rows and present them as authoritative site totals.
- Treat query and page results as top-row evidence, not a complete census. Bing does not expose a global query+page matrix through these endpoints.
- Distinguish the locally selected `window` from each endpoint's `apiCoverage`. `--days` filters returned rows; it does not ask Bing for a date range.
- Expect traffic and crawl data to refresh daily, while query/page datasets refresh weekly. Report `latestDate` rather than claiming same-day freshness.
- Bing traffic includes multiple verticals, including Web, Chat, News, Images, Videos, and Knowledge Panel. Do not label it web-only traffic.
- Run candidate drill-downs sequentially and sparingly. Do not fan out `query-pages` or `page-queries` across every row.
- Preserve exact site identifiers. Do not silently add or remove schemes, hosts, paths, or trailing slashes.
- Never print, log, or commit API keys. Never commit credential files, aliases containing private site names, or raw snapshots.
- Treat site identifiers, search queries, page URLs, crawl details, and performance metrics as private business data even though they are not API secrets.
- Do not weaken the CLI's fixed official API endpoint, private-file permissions, repository-path checks, or default output suppression.
- This skill is read-only. It intentionally does not expose URL or sitemap submission commands.

## Automation Fallback

For unattended jobs, use this order:

1. Fresh API snapshot created during the current run.
2. `latest` successful API snapshot, explicitly marked stale with its fetch time and latest data dates.
3. Existing manual export, explicitly marked with its path and age.
4. No-op when the available evidence is too stale or weak.

Do not claim live Bing data unless the current API request succeeded. Do not run `auth` interactively, publish content, submit URLs, or create a PR merely to show activity.

## Troubleshooting

- If `doctor` reports unsafe permissions, move credentials outside repositories and set mode `0600` on macOS or Linux.
- If authentication fails, regenerate the user-owned key and validate it with `auth`; never print it for debugging.
- If dates appear older than the selected window, compare `apiCoverage`, `selectedCoverage`, and `latestDate` before diagnosing the filter.
- If totals differ from query/page sums, use `summary`: query and page endpoints return Top rows on their own update cadence.
