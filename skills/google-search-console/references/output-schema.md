# Snapshot output schema

`snapshot` writes a JSON object with these top-level fields:

- `schemaVersion`: Snapshot schema version.
- `source`: Always `google-search-console-api` for successful API snapshots.
- `fetchedAt`: UTC timestamp when the fetch completed.
- `property`: Exact Search Console property identifier.
- `searchType`: Usually `web`.
- `dataState`: Usually `final`.
- `period`: Inclusive `startDate` and `endDate` interpreted by Search Console in Pacific Time.
- `datasets`: Named query results.

Default datasets:

- `summary`: Aggregate property metrics without grouping dimensions.
- `date`: Daily metrics.
- `query`: Metrics grouped by query.
- `page`: Metrics grouped by canonical page.
- `query-page`: Metrics grouped by query and page.

Each dataset includes:

- `dimensions`: Requested dimensions in key order.
- `rowCount`: Number of returned rows.
- `pagesFetched`: Number of API pages requested.
- `truncated`: Whether the configured local maximum was reached while a full page was still returned.
- `dataCompleteness`: `aggregate` or `top-rows`.
- `responseAggregationType`: Aggregation type returned by Google.
- `apiMetadata`: Incomplete-data metadata returned by Google, when present.
- `rows`: Normalized objects containing dimension names plus `clicks`, `impressions`, `ctr`, and `position`.

Example row from `query-page`:

```json
{
  "query": "example review",
  "page": "https://example.com/review",
  "clicks": 12,
  "impressions": 900,
  "ctr": 0.0133333333,
  "position": 8.4
}
```

The command prints a compact summary to stdout and stores the full snapshot at the reported `path`. A successful save also updates a small `latest.json` pointer for that property.
