# API key setup

Use a user-owned Bing Webmaster Tools account and API key. Do not provide or reuse organization-wide credentials.

1. Sign in to Bing Webmaster Tools.
2. Add and verify the sites that the user intends to inspect.
3. Open **Settings → API Access → API Key** and generate the user's key.
4. Resolve `SKILL_DIR` to the skill directory and run `node "$SKILL_DIR/scripts/bing-webmaster.mjs" auth` in an interactive terminal. The prompt does not echo the key.
5. Run `node "$SKILL_DIR/scripts/bing-webmaster.mjs" doctor` and require `ready: true` with no warnings.

The CLI validates the key with `GetUserSites`, then stores it in `~/.config/codex-bing-webmaster/credentials.json` with owner-only permissions. The key is user-wide and can access every Bing Webmaster site available to that user. Never commit the credentials file or paste the key into chat, issues, logs, shell history, pull requests, or automation prompts.

For unattended environments, inject `BING_WEBMASTER_API_KEY` through the platform's secret manager. Run `auth --from-env` only when a persistent local `0600` credentials file is desired. Do not put the key directly in a command line.

If a key is exposed, delete and regenerate it in Bing Webmaster Tools, replace it in every authorized environment, and remove it from Git history and log sinks.

Use Microsoft's current documentation when portal labels differ:

- [Getting access to the Bing Webmaster Tools API](https://learn.microsoft.com/en-us/bingwebmaster/getting-access)
- [Bing Webmaster API](https://learn.microsoft.com/en-us/bingwebmaster/)
