# Contributing

Thanks for helping improve Vibe Coding Hub SEO Skills.

## Scope

The `v0.1.x` line is intentionally limited to read-only Google Search Console, Bing Webmaster Tools, and Yandex Webmaster workflows. Keep provider CLIs independent unless a shared abstraction removes proven duplication without weakening platform-specific safety rules.

Open an issue before proposing a new provider, dependency, write operation, or credential model. Small documentation, normalization, test, and compatibility fixes can go directly to a pull request.

## Development requirements

- Node.js 22 or 24.
- No real provider credentials or website data.
- Mock responses for every automated test.

Run the complete local gate:

```bash
npm run check
npm test
```

## Pull requests

1. Keep changes focused on one problem.
2. Add or update tests for behavior changes.
3. Preserve exact property, site, and host identifiers.
4. Keep aggregate totals distinct from Top-row datasets.
5. Do not log credentials, raw queries, page URLs, or private metrics.
6. Update the relevant `SKILL.md`, reference, and changelog entry when user-facing behavior changes.

## Security-sensitive changes

Credential storage, OAuth flows, API endpoints, repository-path checks, permission checks, redaction, and raw-output defaults are security boundaries. Changes to them require explicit tests and a clear rationale in the pull request.

Do not include real tokens even in reverted commits. If sensitive data enters Git history, rotate it immediately and follow [SECURITY.md](SECURITY.md).

## Commit and release conventions

Use concise, imperative commit subjects. Releases follow semantic versioning; all plugin manifests and the Claude marketplace entry must carry the same version.
