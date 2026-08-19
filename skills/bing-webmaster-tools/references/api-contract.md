# Bing Webmaster API contract

## Current transport

- Base URL: `https://ssl.bing.com/webmaster/api.svc/json`.
- Authentication: one user-wide API key in the `apikey` query parameter.
- Endpoint policy: keep the CLI fixed to the official HTTPS service; never make the API host user-configurable because the key is carried in the request URL.
- Responses: legacy WCF JSON wrapped in a top-level `d` property.
- Dates: usually `/Date(<unix-milliseconds><optional-offset>)/`; the numeric value is already an absolute epoch and the suffix must not be applied again.
- Read-only requests use `GET`. Query and page drill-down values must be encoded as JSON strings before URL encoding.

The CLI matches the API-key request pattern used by the local Bing Webmaster iOS project. Microsoft also documents OAuth 2.0 and recommends it for delegated applications; OAuth is intentionally outside this first local automation skill.

## Dataset mapping

| CLI dataset | Bing method | Required input | Expected refresh | Completeness |
| --- | --- | --- | --- | --- |
| `traffic` | `GetRankAndTrafficStats` | site | Daily | Property time series |
| `queries` | `GetQueryStats` | site | Weekly | Top rows |
| `pages` | `GetPageStats` | site | Weekly | Top rows |
| `query-pages` | `GetQueryPageStats` | site, query | Weekly | Candidate drill-down |
| `page-queries` | `GetPageQueryStats` | site, page | Weekly | Candidate drill-down |
| `crawl` | `GetCrawlStats` | site | Daily | Up to six months documented |
| `crawl-issues` | `GetCrawlIssues` | site | Service-defined | Current issue rows |
| `feeds` | `GetFeeds` | site | Service-defined | Current feed rows |
| `url-info` | `GetUrlInfo` | site, URL | Service-defined | One URL |
| `quota` | `GetUrlSubmissionQuota` | site | Service-defined | Read-only quota |

## Error handling

Inspect both the HTTP status and WCF error objects. Bing can return an error object with HTTP 400. Important documented service codes include:

- `3`: invalid API key.
- `4`, `5`: user or host throttling.
- `6`, `13`, `14`: blocked, not allowed, or unauthorized.
- `7`, `8`: invalid URL or parameter.
- `10`, `11`: user or resource not found.
- `16`: deprecated.

Treat unknown codes as service errors and preserve the numeric code. The CLI also treats observed code `17` as throttling. Retry read-only requests conservatively; do not retry mutations automatically.

## Compatibility notes

- Bing's published JSON examples and live responses may use inconsistent field casing.
- `GetPageStats` and `GetQueryPageStats` may place a page URL in a field named `Query`; normalization accepts `Page`, `PageUrl`, and `Query` variants.
- Query/page average positions are locally aggregated with impression weighting for impression position and click weighting for click position.
- Treat negative average-position values such as `-1` as unavailable, not as real rankings.
- Treat optional service dates before 1900, including the observed `1601-01-01` feed submission sentinel, as unset.
- Unknown fields are ignored. Update the normalizer only after obtaining a sanitized fixture or authoritative schema evidence.
