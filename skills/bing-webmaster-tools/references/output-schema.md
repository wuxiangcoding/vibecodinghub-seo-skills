# Snapshot output schema

`snapshot` writes a JSON object with these top-level fields:

- `schemaVersion`: Snapshot schema version.
- `source`: `bing-webmaster-api` for a successful live snapshot.
- `fetchedAt`: UTC timestamp when all requested fetches completed.
- `site`: Exact Bing site URL.
- `window`: Locally selected inclusive `startDate`, `endDate`, `days`, and `anchorSource`.
- `datasets`: Normalized API and locally aggregated datasets.

`--days` does not change the Bing API request. The CLI first fetches Bing's service-defined rows, then anchors the window to the latest traffic date, or the latest dated row when traffic is empty, and filters locally. Use `--end-date YYYY-MM-DD` only when a fixed comparison window is required.

Default datasets:

- `summary`: Authoritative totals computed from selected `traffic` rows.
- `date`: Selected daily traffic rows.
- `query`: Query rows grouped locally across the selected window.
- `page`: Page rows grouped locally across the selected window.
- `query-date`: Selected raw query-period rows used to build `query`.
- `page-date`: Selected raw page-period rows used to build `page`.
- `crawl`: Selected crawl health time series.
- `crawl-issues`: Current crawl issue rows; not date-window filtered.
- `feeds`: Current sitemap/feed rows; not date-window filtered.

Every dataset includes applicable metadata such as:

- `dimensions`: Normalized grouping keys.
- `rowCount`: Rows stored in this dataset.
- `rawRowCount`: Rows returned by Bing before local windowing or aggregation.
- `apiCoverage`: Earliest/latest dates in Bing's unfiltered response.
- `selectedCoverage`: Earliest/latest dates after local windowing.
- `latestDate`: Latest selected data date.
- `updateCadence`: Documented or service-defined refresh cadence.
- `dataCompleteness`: `aggregate`, `top-rows`, `candidate-drilldown`, or `current-state`.
- `rows`: Normalized rows.

Aggregated `query` and `page` rows contain:

```json
{
  "query": "example review",
  "clicks": 12,
  "impressions": 900,
  "ctr": 0.0133333333,
  "avgImpressionPosition": 8.4,
  "avgClickPosition": 6.7,
  "recordCount": 4,
  "latestDate": "2026-07-12"
}
```

The command prints a compact summary with the site identifier suppressed and stores the full snapshot at the reported `path`. Snapshot directories use a deterministic site hash rather than a hostname. A successful save updates a small `latest.json` pointer for that exact site.
