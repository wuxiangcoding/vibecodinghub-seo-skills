# Bing SEO automation guidance

## Recommended shape

Use a repository-scoped worktree job and keep evidence collection separate from content or code changes:

1. Fast-forward from the repository's default branch and require a clean worktree.
2. Run `doctor`; never start `auth` interactively.
3. Create a fresh 28-day snapshot and read the full JSON at the emitted path.
4. Fall back to `latest` only when the live fetch fails, marking its fetch time and latest data dates as stale.
5. Inspect the repository's actual page/content inventory before selecting a candidate.
6. Rank query candidates using impressions, CTR, average impression position, durable intent, existing landing-page fit, and source reliability.
7. Run `query-pages` for at most a small shortlist, normally three to five candidates. Bing has no global query+page matrix; do not fan out across all queries.
8. Check crawl, index, and feed evidence. Prefer a technical fix over new content when crawl or index problems explain the weak performance.
9. Make at most one coherent change and open at most one draft PR. Otherwise no-op and leave the worktree clean.
10. Record the snapshot path, exact site, local window, API coverage, latest dates, candidate evidence, validation, and residual risks in the run report and automation memory.

## Cadence

Prefer weekly content-optimization runs because query and page datasets are documented as weekly updates. A separate daily read-only health monitor may use traffic, crawl, issues, and feeds, but it should not produce daily content churn.

## Candidate rules

- Use snapshot `summary` for authoritative site totals.
- Treat `query` and `page` as top-row signals.
- Favor high-impression, low-CTR queries with a plausible ranking range and a mismatched or missing landing page.
- Segment intent into review, comparison, alternatives, pricing, how-to/install, official/docs, navigational, and broad category intent.
- Reject duplicate content, weak or ambiguous intent, unsupported current facts, and changes without a natural internal-link path.
- Verify product facts with primary sources and do not add SEO `keywords` metadata.

## Safety boundaries

- Do not expose the API key in prompts, logs, PRs, or memory.
- Do not submit URLs automatically. Submission consumes quota and a successful request does not mean the URL was crawled or indexed.
- Do not claim a live data run when the current snapshot failed.
- Do not create an issue or PR merely to show daily activity.
