# Current Conditions — Tasks 1–3

Implemented against main `f243791fc6232bfdf30aad86721bc4a1f05a723c`.
Only frontend files changed; no dependencies, backend integrations or migrations added.

## Data and refresh

`DailyForecast` retains its existing server loader. On park pages its client view
renders Current Conditions and Daily Forecast as sibling sections, sharing
`liveData`, the clock and the existing refresh action. There are no duplicate
weather requests, additional timers or provider calls. The current summary is
independent of the selected chart date/window and sits outside the chart's
fullscreen element. Standalone Daily Forecast use remains supported.

`prepareCurrentConditions` is a read-only selector. Each weather variable uses
its latest finite observation at or before now; a missing newer value does not
erase an older actual sample or turn a forecast into a measurement. Older samples
are labelled and retain their original timestamps. Weather readings older than
60 minutes are marked delayed. This is a frontend freshness threshold, not an
API-provided status. Water uses the latest actual history/preceding observation;
the two-hour stale threshold matches the backend latest-water endpoint.

Station names and IDs come from the API, never hardcoded to every park. The
configured Laguuni stations are Kaisaniemi and Lauttasaaren mattolaituri (UiRaS).
Forecast location comes from `forecast_location` (Karhusaari for Laguuni).

The current-hour forecast is selected by exact instant using the park's timezone.
Both autumn repeated hours stay distinct, and intervals crossing DST include
UTC offsets. FMI/ECMWF precedence and current-hour fallback remain backend-owned.
A missing current hour is not filled with another hour. Probability accepts only
finite values from 0 through 100; zero is a real value. Forecast snapshots older
than 30 minutes are labelled delayed, including cached data retained after a
refresh failure.

The existing FMI parser maps `precipitation1h` to observed `precipitation`.
Measured rain therefore covers the preceding elapsed hour ending at the actual
sample timestamp: e.g. a 19:10 sample is labelled 18:10–19:10. Ten-minute reports
are not summed or relabelled as a completed clock hour. Aggregated, non-FMI and
negative rain values are unavailable because an equivalent interval/value
interpretation has not been established. Missing measured rain has no invented
interval. Forecast probability always labels the current forecast hour.

## Interface

Simple is the default. The seven rows use the existing unit formatters, EN/FI
translations and an aligned value column. Per-row measurement/forecast labels,
sample times and delayed/older-reading messages remain visible. Source/location,
full sample date/time and retrieval time are preserved in value titles and
screen-reader text; the planned source dropdown is not implemented here.

The Simple/Detailed controls reuse the Daily Forecast button styles and expose
`aria-pressed`/`aria-controls`. Detailed shows an explicit placeholder. The desktop
layout reserves approximately half the width on the right for the future wind
visualization; mobile gives the summary full width. No existing wind visualization
was present to move or modify.

## Verification

- `npm test`: 85 passed (including 19 new selection/DOM tests).
- `npx next typegen`, `npx tsc --noEmit`, `npm run lint`: passed.
- `npm run build`: passed.
- Production HTTP smoke checks with synthetic API fixtures: English and Finnish
  park pages returned 200 with seven rows and one request per weather source;
  root redirected to `/en`.
- `npm run test:parks`: 6 passed, 8 failed (7 failing subtests plus their parent).
  The same failures were reproduced in an isolated build of the original main
  snapshot. Those older tests expect removed booking/country/website content and
  outdated availability markup; they were not changed as part of this task.
- Browser visual verification was not completed: no Chromium binary was present
  and the browser download failed. DOM interaction/hydration tests passed. Real
  phone, desktop visual and light/dark checks remain for manual verification.

No live FastAPI service was available: station assignments and current provider
availability were not rechecked against production data. Weather selection is
bounded by the existing three-day history request. With no sample in that range,
the summary shows unavailable instead of claiming there is no older measurement.
Water history can supply an older preceding sample. Forecast `fetched_at` is
snapshot-level; the API does not expose a separate fetch time for each fallback
point. No per-point retrieval timestamp is invented.

## Next authorized scope

Task 4 remains the Detailed three-column view. Source/Data Availability disclosure
and the wind-direction visualization remain separate work. Do not expand scope
without new task-specific authorization.
