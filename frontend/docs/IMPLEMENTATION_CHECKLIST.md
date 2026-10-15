# WakeCast frontend implementation checklist

This is the source of truth for Work mode. Checkbox status: [x] completed and verified previously, [ ] not yet completed. An item must be verified before changing it to [x]. Never mark proposed code as complete without running checks.

## 0. Preparation (pre-implementation handoff)
- [x] 0.1 Record agreed homepage/park/chart/compass/table UX and language requirements in `frontend/docs/DESIGN_SPEC.md`.
- [x] 0.2 Inventory existing GitHub main-branch API/model fields; record confirmed backend gaps (observations route, historical water-temperature route, nullable rain probability / provider precedence).
- [x] 0.3 Prepare revised `frontend/AGENTS.md` instructions, preserving Next-generated block. **Handoff file prepared, not yet installed into repository.**
- [ ] 0.4 At start of Work mode, inspect actual local working tree/branches and reconcile any changes since GitHub review; install/reconcile these documents into repo on an authorized feature branch.
- [ ] 0.5 Resolve any conflicts with root `AGENTS.md`, especially its full-checklist-in-every-response instruction: user wants the active top-level section only in normal replies, full checklist when requested/transitioning sections.

## 1. Frontend Foundation
- [x] 1.1 Review existing frontend structure and dependencies (Next.js/React/TypeScript/Tailwind).
- [x] 1.2 Establish frontend architecture, locale routing, and initial API integration (`/en`, `/fi`, typed parks API).
- [ ] 1.3 Design and implement responsive shared layout and navigation: header/logo, language switcher, content width, homepage/park page skeletons; EN/FI UX; keyboard/mobile checks.
  - Implemented shared locale layout, header, language navigation, skip link, responsive width/spacing and localized empty/error handling; preserved the existing simple names/count. No park-detail route was added, per the Section 1 task restriction. Production HTTP checks passed for `/en`, `/fi`, `/` redirect and unsupported locale. Visual/keyboard browser checks remain pending: Chromium was unavailable and its download failed in this environment.
- [ ] 1.4 Inventory live API route payloads/DB relationships, sample forecast horizons, observed station mapping, and data freshness; confirm UI data contract and missing/null semantics before weather implementation.
  - Source contract/relationship audit completed against `034196b`; both history routes are now implemented and registered. See `API_CONTRACT.md`. Live response samples, actual station configuration, forecast horizon/PoP coverage and freshness remain pending because no live backend is reachable here.
- [x] 1.5 Introduce shared typed weather models/API client methods, formatting utilities (m/s, °C, %, bearing, provenance) and park-timezone date helpers; test DST-sensitive cases.
  - Verified: 16 Node tests passed, TypeScript validation, ESLint and production build passed. No new package dependencies; no observation/forecast composition or charts added.

## 2. Wakepark Pages
- [ ] 2.1 Compact clickable park-list rows on homepage; desktop single-row conditions and mobile wrap; weather icon, temperature, wind/gust, water. Show loading/error/unavailable states; source/time labels.
- [ ] 2.2 Localized park detail page route and main hierarchy: park metadata, current conditions, daily graph, weekly graph, detailed table, booking information.
- [ ] 2.3 Cable details, booking links and website URL with `_fi` fallbacks to English where unavailable; valid external-link semantics.
- [ ] 2.4 Current conditions aggregation: latest real observations when available, forecast fallback explicitly labeled, wind direction FROM bearing, air/water weather sources and timestamps.
- [ ] 2.5 Replaceable compass illustration + dynamic wind arrow; initially generic compass backdrop; support future user-supplied north-oriented aerial image with marked cables, without rewriting arrow logic.

## 3. Weather Dashboard and Backend Readiness
- [ ] 3.1 Integrate and verify prepared read-only park observation-history endpoint `/api/parks/{slug}/weather/observations`, with bounded aware [start,end) query, station metadata, raw stored timestamps, no provider calls. See separate backend patch bundle; implementation prepared but NOT applied.
- [ ] 3.2 Integrate and verify prepared read-only park water-temperature-history endpoint `/api/parks/{slug}/water-temperature/history`, with actual reading timestamps, source/station location and bounded queries. Preserve the existing latest-reading route; implementation prepared but NOT applied.
- [ ] 3.3 Verify actual 10-day forecast coverage and non-null FMI `PoP` values per timestamp (official edited product spans up to 240h). Display rain probability ONLY where non-null, including FMI-preferred overlapping timestamps; never invent 0% for ECMWF `null`.
- [ ] 3.4 Implement unified UI series/observation-vs-forecast composition and explicit source attribution, missing-value policy, current-time divider and historical-only water-temperature line / last-known-value disclosure; NO extension into future slots. Test station delay, overlapping points, empty data and DST boundaries.
- [ ] 3.5 Implement the daily LOCAL calendar day weather graph, hourly timeline, four thin lines, dual independent axes (wind 0–15 m/s; temperature 0–40 °C, adaptive), subtle cloudiness background and rain-probability boxes below.
- [ ] 3.6 Implement daily navigation across supported historical/future days, today shortcut, loading/errors, no fabricated historical samples.
- [ ] 3.7 Implement weekly chart with identical styling at 3-hour resolution and exactly two pages: (today−3 .. today+3) and (tomorrow .. today+7).
- [ ] 3.8 Implement tooltip and inspection interactions on hover, touch and keyboard, with values, observation/forecast source, water-temperature observation time, and measured precipitation amount (mm).
- [ ] 3.9 Implement ONE collapsed-by-default detailed data table below charts. One local day per page, hourly rows (23/24/25 as applicable), back through historical observations and forward up to 10 days where coverage exists; numeric columns matching chart plus source, measured precipitation amount (mm) and wind direction where available.
- [ ] 3.10 On current-day table, add distinctive observed/forecast styling, explicit source column and NOW divider independent of delayed-observation boundary; ensure data is never silently reclassified as measured.
- [ ] 3.11 Verify weather icon derivation and labels for cloudiness, day/night and precipitation, with honest limitations where data does not support a claim.

## 4. User Experience
- [ ] 4.1 Responsive charts, tooltip and detailed table on phones/tablets/desktops; accessible scrolling/time reading.
- [ ] 4.2 Loading, API error, stale, missing measurement and partial forecast-coverage states; distinguish no rain (0) from unknown (`null`).
- [ ] 4.3 Forecast `fetched_at`, coverage/availability and measurement observation-time/freshness indicators; correct forecast-vs-measurement source disclosures: a clickable circled `!` by current weather/water values opens actual provider, station name, measurement timestamp and freshness; do not imply sensors at the park.
- [ ] 4.4 Consistent visual design, labels, contrast (color never sole indicator), keyboard/touch accessibility, EN/FI translations, responsive header and semantic headings.
- [ ] 4.5 Verify visualization performance and network behavior (server data loading, avoiding repeated per-point API requests, reasonable caching/refresh behavior).

## 5. Final Verification and MVP Review
- [ ] 5.1 Unit and component tests for localized time grouping, DST boundaries, forecast precedence, null handling, water-temperature carry-forward, chart series and table navigation.
- [ ] 5.2 Backend tests for new read-only endpoints, authorization boundaries if needed, station associations, date filters and empty data; full backend pytest + Ruff if backend changed.
- [ ] 5.3 Frontend TypeScript, ESLint, production build and meaningful UI tests; don't claim results without execution.
- [ ] 5.4 Frontend/backend end-to-end manual verification of homepage, park details, daily & weekly windows, current-day measured/forecast split, historical table, EN/FI and mobile.
- [ ] 5.5 Final MVP review against `DESIGN_SPEC.md`; summarize changed files, test results, backend limitations, deferred work, and require authorization for any commit/push/merge.

## 6. Explicitly deferred
- [ ] 6.1 User-created aerial park image with marked cables (the compass component must support replacing backdrop when available).
- [ ] 6.2 Rain radar below charts, selecting a legal/usable radar data provider and displaying proper attribution.
- [ ] 6.3 Dedicated long-term historical analysis page, forecast accuracy analytics and further weather metrics, only after separate authorization.

## Work mode operating protocol
1. Read root `AGENTS.md`, `frontend/AGENTS.md`, `frontend/docs/DESIGN_SPEC.md`, this checklist, and the relevant Next.js docs inside `frontend/node_modules/next/dist/docs/` before frontend code.
2. Inspect the current branch and local modifications. Root AGENTS requires a dedicated feature branch, no changes on `main`; never commit, push, merge or migrate a database without specific authorization.
3. Before each development task, state the CURRENT checklist item, inspected files, expected edits and test plan. Implement ONE item or a tightly coupled prerequisite at a time; stop for user review.
4. Label any code presented in chat as **COMPLETE FILE** or **PARTIAL CHANGE**. Use full file for shorter modules and precise patches for small edits; keep URLs unbroken.
5. Run only relevant checks first; full backend pytest + Ruff once when finishing backend changes; `npx tsc --noEmit`, `npm run lint`, and build where relevant. Use the database-test safety rules.
6. Never invent missing API fields, fake forecast probability, fill unknown observations or confuse park/location vs nearby observation station.
7. Begin normal status responses with CURRENT TOP-LEVEL checklist section only (user preference); show full list upon explicit request or upon moving to another top-level section.
8. Stop and ask about architecture/provider changes or new external dependencies. Keep source-specific logic separate.
