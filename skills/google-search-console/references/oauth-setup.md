# OAuth setup

Use a user-owned Google Cloud project and Desktop OAuth client. Do not provide or reuse organization-wide credentials.

1. Create or select a Google Cloud project.
2. Enable the Google Search Console API.
3. Configure the OAuth consent screen for the user's intended audience.
4. Create an OAuth client with application type **Desktop app**.
5. Download its JSON file and save it as `~/.config/codex-gsc/oauth-client.json`.
6. On macOS or Linux, restrict it with `chmod 600 ~/.config/codex-gsc/oauth-client.json`.
7. Resolve `SKILL_DIR` to the skill directory, run `node "$SKILL_DIR/scripts/gsc.mjs" doctor`, then run `node "$SKILL_DIR/scripts/gsc.mjs" auth` interactively.

The CLI requests only `https://www.googleapis.com/auth/webmasters.readonly`. It stores the resulting token in `~/.config/codex-gsc/token.json` with owner-only file permissions. Never commit either JSON file or paste their contents into chat, issues, logs, or pull requests.

Use Google's current documentation when Cloud Console labels or screens differ:

- [OAuth 2.0 for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Search Console authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing)
- [OAuth security best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
