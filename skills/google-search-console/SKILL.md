---
name: google-search-console
description: Fetch, normalize, cache, and inspect Google Search Console performance data through the Search Console API. Use when Codex needs to authenticate a local GSC integration, list accessible properties, analyze clicks/impressions/CTR/position by query, page, date, country, device, or combined dimensions, replace manual GSC XLSX exports, or supply reproducible GSC evidence to SEO automations across multiple websites.
---

# Google Search Console

## Overview

Use the bundled dependency-free Node.js CLI for every Google Search Console API operation. This skill is read-only and supports exact property discovery, normalized performance queries, and reproducible JSON snapshots.

## Privacy model

Require each user to create their own Google Desktop OAuth client; never distribute shared OAuth credentials with this skill. Keep credentials, tokens, aliases, and snapshots outside repositories under `~/.config/codex-gsc` and `~/.local/share/codex-gsc` by default. Treat property identifiers, queries, URLs, and metrics as private business data.

## Requirements

- Node.js 22 or newer.
- A Google account with Search Console access.
- A user-owned Desktop OAuth client with the Search Console API enabled.

## Setup

Resolve `SKILL_DIR` to the absolute directory containing this `SKILL.md`; do not assume the user's current working directory is the skill directory. Run commands as `node "$SKILL_DIR/scripts/gsc.mjs" ...`.

Read [references/oauth-setup.md](references/oauth-setup.md), then run:

```bash
node "$SKILL_DIR/scripts/gsc.mjs" doctor
node "$SKILL_DIR/scripts/gsc.mjs" auth
```

## Workflow

1. Run `node "$SKILL_DIR/scripts/gsc.mjs" doctor` before querying.
2. If authorization is missing and the user asked to configure access, read [references/oauth-setup.md](references/oauth-setup.md), then run `node "$SKILL_DIR/scripts/gsc.mjs" auth`. Never create OAuth credentials for the user, reuse another person's client, or start an interactive authorization flow from unattended automation.
3. Run `node "$SKILL_DIR/scripts/gsc.mjs" sites` and use the exact property identifier returned by the API, such as `sc-domain:example.com` or `https://www.example.com/`.
4. Add a stable alias when useful: `node "$SKILL_DIR/scripts/gsc.mjs" alias --name example --site sc-domain:example.com`.
5. For repeatable analysis, prefer a snapshot:

   `node "$SKILL_DIR/scripts/gsc.mjs" snapshot --site example --days 28`

6. Read the emitted snapshot path and report its `source`, `fetchedAt`, property, period, data state, and row counts. Read [references/output-schema.md](references/output-schema.md) when interpreting or transforming snapshot data.

## Commands

- `doctor`: inspect credential/token readiness without revealing secrets.
- `auth`: perform the one-time Desktop OAuth loopback flow with the read-only Search Console scope.
- `refresh`: force a refresh-token exchange and print only the new expiry metadata; use this to verify unattended access.
- `sites`: list accessible Search Console properties and permission levels.
- `alias`: save a local alias for an exact property identifier.
- `query`: fetch one dimension set; prefer `--output` to a path outside repositories. Use `--stdout` only when the user explicitly accepts that raw query/page data may enter terminal or automation logs.
- `snapshot`: fetch summary, date, query, page, and query+page datasets into one versioned JSON snapshot.
- `latest`: locate the last successful local snapshot for a property.

Run `node "$SKILL_DIR/scripts/gsc.mjs" help` for complete flags.

## Output

Snapshots record the exact property, Pacific-time period, search type, data state, normalized datasets, row counts, pagination, truncation, and completeness. Use the `summary` dataset for authoritative totals. Read [references/output-schema.md](references/output-schema.md) before interpreting or transforming snapshot data.

## Data limitations

- Default to finalized web-search data for the 28-day window ending three Pacific-time days ago.
- Treat query/page results as top-row evidence, not a complete census. Search Console applies internal data limits even when pagination succeeds.
- Use the summary dataset for aggregate totals. Do not sum query or page rows and present the result as an authoritative property total.
- Query+page requests are relatively expensive. Cache a daily snapshot and avoid repeatedly requesting the same window.
- Preserve exact property identifiers. Do not silently convert between Domain and URL-prefix properties.
- Never print client secrets, access tokens, or refresh tokens.
- Never commit OAuth files, tokens, aliases containing private property names, or raw snapshots to a repository.
- Treat property identifiers, search queries, page URLs, and performance metrics as private business data even though they are not OAuth secrets.
- Do not weaken the CLI's private-file permission or repository-path checks. Ask the user to move sensitive files instead.

## Automation Fallback

For unattended jobs, use this order:

1. Fresh API snapshot created during the current run.
2. `latest` successful API snapshot, explicitly marked stale with its fetch time.
3. Existing manual export, explicitly marked with its path and age.
4. No-op when the available evidence is too stale or weak.

Do not claim live GSC data unless the current API request succeeded.

## Troubleshooting

- If `doctor` reports unsafe permissions, move credentials outside repositories and set mode `0600` on macOS or Linux.
- If Google does not return a refresh token, revoke the prior grant and repeat `auth` with consent.
- If a property is missing, verify the signed-in Google account and permission level; do not rewrite its identifier.
- If totals differ from query/page sums, use `summary`: query and page datasets are limited Top-row evidence.
