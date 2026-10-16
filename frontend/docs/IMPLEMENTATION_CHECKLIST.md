# WakeCast.fi — Frontend Implementation Checklist

**Updated:** 2026-10-17  
**Reference:** GitHub `main` branch (`pyrypiironen/WakeCast`), current frontend code and agreed WakeCast design.  
**Purpose:** Source of truth for frontend development progress and remaining MVP work.

## Status rules

- `[x]` — Implemented and supported by existing code and/or previously reported verification.
- `[ ]` — Not implemented, not completely verified, or still requiring work.
- A partially completed parent item remains unchecked; completed subitems are shown separately.
- Do not claim tests were rerun, browser behavior verified, or a commit pushed unless that happened during the relevant task.
- Source-code review confirms what exists in `main`, not the state of any uncommitted local files or a running deployment.
- Preserve observed-vs-forecast provenance, actual sample timestamps, and missing/null values; do not fabricate weather data.

## 0. Preparation, specifications and workflow

- [x] **0.1** Document homepage, park-page, chart, compass, table and bilingual UX requirements in `frontend/docs/DESIGN_SPEC.md`.
- [x] **0.2** Audit the backend weather and water API contracts in `frontend/docs/API_CONTRACT.md`.
- [x] **0.3** Install frontend-specific guidance in `frontend/AGENTS.md`, preserving the Next.js-generated instructions.
- [x] **0.4** Establish and publish the frontend foundation; merge the feature work into `main`.
- [ ] **0.5** Refresh outdated documentation (`DESIGN_SPEC.md`, `API_CONTRACT.md`, `FOUNDATION_HANDOFF.md`) after implementation and reconcile any old statements that history endpoints or the daily chart are still only planned.
- [ ] **0.6** Reconcile the conflicting checklist-output preferences in root `AGENTS.md` and `frontend/AGENTS.md`. Until explicitly changed, follow the applicable repository instructions; do not silently overwrite them.
- [ ] **0.7** At each future task, inspect the current branch and local working-tree status before making changes.

**Git workflow note:** The user has chosen to perform their own work directly on `main`. Root `AGENTS.md` separately instructs AI agents not to modify `main` directly and not to commit, push or merge without task-specific authorization. That restriction remains in effect unless the repository instructions are explicitly updated. The user can still run their own Git commands on `main`.

## 1. Frontend foundation and shared architecture

- [x] **1.1** Establish Next.js 16, React 19, TypeScript and Tailwind CSS 4 frontend architecture.
- [x] **1.2** Implement `/en` and `/fi` locale routing, language switching and localized text.
- [x] **1.3a** Build shared header, navigation, skip link, responsive content container and basic error/empty states.
- [ ] **1.3b** Finish mobile, visual, keyboard, focus and accessibility verification of shared layout and navigation.
- [x] **1.4a** Define typed parks, forecasts, weather-observation history and water-temperature API payloads.
- [x] **1.4b** Connect server-side API requests for parks, forecasts, observation history and water-temperature history.
- [ ] **1.4c** Verify actual live data across representative parks: station assignments, earliest/latest samples, staleness, response gaps, FMI PoP availability and local-day forecast horizon.
- [x] **1.5** Implement formatting and timezone utilities, including DST-sensitive day boundaries and associated unit tests.
- [x] **1.6** Implement shared light/dark theme variables.
- [x] **1.7** Centralize chart sky/cloud color variables in `globals.css`; use the same cloud color in chart and legend.

## 2. Wakepark pages and current conditions

- [ ] **2.1** Replace the homepage's basic park list with compact, clickable park rows showing an icon, air temperature, wind speed/gust, water temperature and source/time details; wrap cleanly on mobile.
- [x] **2.2** Implement localized park detail route `/[lang]/parks/[slug]`, metadata, error/not-found states and structural current/daily/weekly/table sections.
- [x] **2.3** Display cables, website and booking links, with Finnish URL fallback where available.
- [x] **2.4a** Connect the daily forecast component to each park detail page.
- [ ] **2.4b** Implement current-conditions aggregation: latest actual weather/water observations, explicit forecast fallback, sample timestamps and freshness; never present forecasts as measurements.
- [ ] **2.5** Add a generic replaceable compass backdrop and meteorological wind-direction arrow (wind direction is the direction FROM which wind blows).
- [ ] **2.6** Add current-conditions weather icons with day/night, cloudiness and precipitation logic supported by real data.
- [ ] **2.7** Add clickable/tappable source-details disclosure by current conditions, including providers, nearby station names and true sample times.

## 3. Daily weather chart and data readiness

### 3.1 Backend integration and data selection

- [x] **3.1** Implement and integrate read-only `/api/parks/{slug}/weather/observations` with bounded, timezone-aware `[start,end)` queries and station metadata.
- [x] **3.2** Implement and integrate read-only `/api/parks/{slug}/water-temperature/history`; preserve true reading timestamps, source/station metadata and preceding observation.
- [ ] **3.3** Verify actual forecast coverage for the intended next ~10 days, including gaps and non-null FMI precipitation probability (`PoP`) values. Never replace unknown (`null`) with 0%.
- [x] **3.4a** Compose local-day weather observations and future forecasts as separate series without interpolating missing readings.
- [x] **3.4b** Implement continuity rules and visible breaks for invalid/missing samples and forecast source changes.
- [x] **3.4c** Implement `selectDailyWater()` and tested held-interval selection as frontend data utilities.
- [ ] **3.4d** Render measured water temperature on the chart and clearly disclose the true measurement timestamp; do not extend the line beyond the latest actual reading or into forecast-only time.
- [ ] **3.4e** Add explicit NOW divider independent of observation delays and tests for source precedence, unavailable data and edge cases.

### 3.2 Completed daily chart UI

- [x] **3.5a** Render wind speed, wind gust and air temperature as thin colored SVG curves.
- [x] **3.5b** Render temperature and wind on independent, adaptive vertical scales with hourly time gridlines.
- [x] **3.5c** Implement park-local day navigation: previous day, today and next day.
- [x] **3.5d** Implement 09:00–21:00 and 24-hour chart display modes.
- [x] **3.5e** Draw solid observation lines and dashed forecast lines, including valid measured-to-forecast connections.
- [x] **3.5f** Draw continuous cloudiness shading, filled vertically from the bottom to represent the 0–100% percentage.
- [x] **3.5g** Distinguish missing cloudiness coverage (white) from a valid 0% reading (sky color).
- [x] **3.5h** Add a cloudiness percentage scale, hourly grid and legible day-end axis labels.
- [x] **3.5i** Add a five-item bilingual legend: air, water, wind, gust and cloudiness. Note: the water entry is a legend placeholder until its curve is implemented.
- [x] **3.5j** Use centralized sky/cloud CSS variables; support light/dark cloud shades and keep legend color synchronized.
- [x] **3.5k** Show a compact localized source-information line with readable labels for FMI, ECMWF, HARMONIE, SYKE and UiRaS.
- [x] **3.5l** Replace the gap/source-change dropdown with numbered source-change markers and a plain-text explanation at the very bottom of the chart caption.
- [x] **3.5m** Remove the redundant “Day length” caption and duplicate availability display.

### 3.3 Remaining daily chart features

- [ ] **3.6** Add the actual water-temperature history line, preserving measurement provenance and stopping at the last valid measurement.
- [ ] **3.7** Add an aligned precipitation-probability (%) row below the plot, only where provided by the forecast. Keep measured precipitation amounts (mm) separate.
- [ ] **3.8** Add hover, touch and keyboard-accessible tooltip/inspection of timestamp, wind, gusts, temperatures, cloudiness, precipitation and source details.
- [ ] **3.9** Add an explicit NOW marker at the current park-local time.
- [ ] **3.10** Verify continuity, clipping, provider changes, DST, null cloudiness, observation/forecast transitions and source-marker numbering with focused tests.
- [ ] **3.11** Check actual water-provider source identifiers against display-name mapping (e.g. backend `UIRA` vs frontend `uiras`) to ensure `UiRaS` is displayed consistently.
- [ ] **3.12** Validate no-data, future-day, partial-coverage and stale-state messaging in real browser flows.

## 4. Weekly weather chart

- [ ] **4.1** Implement the weekly graph using the daily chart's axes, weather colors and data semantics.
- [ ] **4.2** Use 3-hour plotting intervals without inventing missing observations or forecasts.
- [ ] **4.3** Provide exactly two agreed views: `today−3 … today+3` and `tomorrow … today+7` (local days).
- [ ] **4.4** Plot available historical observations, future forecasts, actual water readings and cloudiness correctly; do not extrapolate measured water into future periods.
- [ ] **4.5** Add source/freshness disclosure, forecast gaps and precipitation probability where genuinely available.
- [ ] **4.6** Verify responsiveness, touch/keyboard interaction, locales and DST/timezone behavior.

## 5. Detailed weather-data table

- [ ] **5.1** Implement ONE collapsed-by-default detailed table beneath the charts.
- [ ] **5.2** Support one local calendar day per page, with previous/next day navigation and 23/24/25 hourly rows where appropriate.
- [ ] **5.3** Include wind, gusts, air/water temperatures, cloudiness, precipitation probability, measured/forecast precipitation amount, wind direction and source when available.
- [ ] **5.4** Visually distinguish observation rows from forecast rows and add a NOW divider on the current day.
- [ ] **5.5** Show measurement timestamp and station/source provenance, especially when the last water reading is carried forward.
- [ ] **5.6** Handle unavailable or partial data without substituting zeros; provide a usable mobile horizontally scrollable table and accessible controls.

## 6. General user experience and data integrity

- [x] **6.1a** Apply an initial coherent visual system with responsive navigation, chart/legend styling, shared CSS color variables and EN/FI labels.
- [ ] **6.1b** Finish contrast, keyboard navigation, touch-target, screen-reader and narrow-screen visual checks across all implemented pages.
- [ ] **6.2** Audit API errors, stale weather/water data, null-versus-zero semantics, provider gaps and partial-day forecast coverage.
- [ ] **6.3** Expose timestamps, `fetched_at`, forecast coverage, observation locations and freshness without implying that nearby stations are on-park sensors.
- [ ] **6.4** Assess frontend performance, responsive SVG rendering, API request behavior and refresh/caching strategy.
- [ ] **6.5** Add a dedicated localized **Data Sources / Tietolähteet** page with providers, attribution, intermediary API services (including Open-Meteo) and applicable licensing terms.

## 7. Verification and MVP review

- [x] **7.1a** Create unit tests for API clients, date/format helpers, daily series, water held intervals and chart-line utilities.
- [x] **7.1b** Perform previously reported daily chart unit/TypeScript/lint and browser spot-checks during development.
- [ ] **7.1c** Add regression tests for newly added cloud rendering, provider labels, source-change caption, and water/rain/NOW interactions as they are implemented.
- [ ] **7.2** Verify backend history endpoints and station/date filtering against a running backend; run full backend tests + Ruff when backend code changes.
- [ ] **7.3** Rerun frontend `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` and relevant route/UI checks at final MVP completion.
- [ ] **7.4** Perform full desktop/mobile, light/dark, Finnish/English, keyboard/touch and end-to-end checks for homepage, current conditions, daily/weekly charts and table.
- [ ] **7.5** Review MVP against `frontend/docs/DESIGN_SPEC.md`, record known limitations, update documentation and commit/push only with task-specific authorization.

## 8. Explicitly deferred features

- [ ] **8.1** Park-specific north-oriented aerial image with marked cables, while preserving a replaceable compass backdrop.
- [ ] **8.2** Rain radar below forecast charts, after confirming a suitable provider and attribution/license.
- [ ] **8.3** Long-term historical weather analysis and forecast-versus-observation accuracy analytics.
- [ ] **8.4** Additional wakeparks/station coverage and new weather metrics, as separately approved.

## Recommended implementation sequence

1. Finish **3.6**: water-temperature history line in the daily chart (use existing `selectDailyWater()` carefully; verify line does not continue beyond the last actual reading).
2. Finish **3.7**: precipitation probability below the chart with explicit no-data handling.
3. Finish **3.8–3.12**: tooltips, NOW indicator and daily-chart reliability tests.
4. Finish **2.4b–2.7**: current conditions and wind compass.
5. Complete **4**: weekly chart.
6. Complete **5**: detailed hourly data table.
7. Complete **2.1**: homepage rows with current conditions.
8. Complete **6–7**: accessibility, attribution, performance, final end-to-end verification and docs.

## Operating protocol

1. Read `AGENTS.md`, `frontend/AGENTS.md`, this checklist and relevant design/API documentation before a frontend implementation task; inspect relevant Next.js local documentation when coding.
2. Inspect the current local branch and uncommitted changes. Do not overwrite local work. Follow applicable repository Git restrictions; user operations on `main` do not automatically authorize AI-agent writes to `main`.
3. Implement one numbered task or a tightly connected set of subitems at a time. State planned files and checks, preserve existing architecture and obtain approval for provider/API/schema changes.
4. Label code instructions **COMPLETE FILE** or **PARTIAL CHANGE**, and specify exact insertion/replacement boundaries.
5. Run focused tests for code changes. For documentation-only changes, tests are unnecessary unless code is also modified. Never claim tests or browser checks that were not performed.
6. Keep observations, forecasts and water-temperature samples distinct. Preserve source, station, timestamp, `fetched_at`, nulls, and forecast history. Use park-local dates and DST-aware boundaries.
7. In routine development status messages, prefer the current top-level checklist section; provide the complete checklist when expressly requested, subject to the repository's active instructions.
8. Stop after the requested task, report changed files, actual verification and any unresolved items; do not commit/push/merge or migrate a database without authorization specific to that action.
