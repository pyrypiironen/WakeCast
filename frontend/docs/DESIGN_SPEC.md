# WakeCast frontend design specification — agreed decisions

Status: prepared for Work mode; visual details may be refined during implementation without changing functional requirements.

## Goal, stack, and information hierarchy
- Data-first wakeboarding weather website, not a lifestyle/photo-heavy landing page.
- Existing stack: Next.js 16, React 19, TypeScript, Tailwind CSS 4; FastAPI/PostgreSQL backend.
- Primary language English `/en`, secondary Finnish `/fi`. All navigation, data labels, fallback states and accessibility labels localized.
- Mobile-first; desktop has equally functional, information-dense layout.
- Weather source/provenance, observation station, last observed time and forecast freshness must be honest and legible.

## Homepage
- List wakeparks as clickable, compact rows; desktop shows name/location + key conditions in same row, mobile wraps gracefully.
- Current summary: small sunny/cloudy icon, air temperature, wind speed and gusts, water temperature; include wind direction if it fits without clutter.
- Do not conflate last observed weather readings with forecasts. Label source and timestamp where needed; show unavailable data as unavailable.
- Clicking a row opens the localized park page.

## Park page top
- Park name, city and cable/booking links with locale-specific URL when present, else fallback English URL.
- Key current conditions: air temperature, wind, gust, water temperature, condition icon, wind direction + visual compass.
- Initial wind direction illustration uses a generic compass background asset; park-specific north-oriented images marked with cables will be supplied later. Keep background interchangeable and wind-arrow overlay independent.
- Meteorological direction = FROM bearing; movement arrow, if present, points TO the opposite bearing. Explicit north-orientation calibration per background.
- Observation station may differ from park coordinates: show station name and avoid implying an on-site wind sensor. Add a clickable/tappable circled `!` beside current conditions; disclosure explains provider, weather station, water-temperature station, actual timestamps, freshness, and that stations are nearby rather than on-park.

## Chart organization and axes
- Daily and weekly charts use the same visual language, four thin lines in one graph:
  - wind speed: prominent dark green, m/s
  - wind gust: lighter green, m/s
  - air temperature: orange, degrees Celsius
  - water temperature: blue, degrees Celsius
- Temperature lines share the same vertical Celsius axis, normally 0–40 °C. Wind/gust share an independent axis, normally 0–15 m/s. Extend axes for out-of-range values (e.g., freezing air or gust >15 m/s); never clip real values.
- Cloudiness is rendered as subtle, visually subordinate background shading by time slot. Values in percent (0–100) and available in tooltips/table; shading must not hide lines or imply precipitation.
- Rain probability appears as percentage boxes in an aligned row UNDER the four-line plot, within its overall chart section. Blue shade intensity reflects chance of precipitation, with printed percentages. Show unavailable as an explicit blank/dash, not 0%.
- No rain-probability measurements in historical observations; show measured precipitation amount (mm) in both tooltip and detailed hourly table for observed periods.
- Clear vertical NOW marker at current park-local time, distinguish actual observation-derived parts from future forecasts (e.g. line dashing, unobtrusive regions), and do not join across missing observation data.
- Water temperature is a continuous line ONLY through periods supported by real measured samples, and may connect measured points or hold the latest known reading between samples. Tooltip must disclose the timestamp and station of the underlying actual sample; do not claim these are hourly measurements. STOP the line at the latest real measurement (at/before now), and leave future forecast periods BLANK; never extrapolate water temperature into future.
- Tooltips: hover/cursor tracking on desktop; tap/drag on touch; keyboard selection and accessible numeric alternatives. Show exact timestamp, wind, gust, air, water, cloudiness, rain probability or observed precipitation as appropriate, and provenance/time of measurement or forecast.
- Time axis uses park's IANA timezone and actual local dates, including DST day length changes.

## Daily graph
- One LOCAL CALENDAR DAY at a time (midnight to next midnight), one-hour columns. Previous/next date navigation, with today shortcut.
- Plot past observations and future forecasts, with no fabricated missing history. Observation staleness and provider attribution are visible.

## Weekly graph
- Three-hour slots. Two explicit views:
  1. today−3 days through today+3 days (history and forecast)
  2. tomorrow through today+7 days (forecast only)
- This is NOT a day-8-through-day-14 view. Do not describe the two views as 10 full future calendar days: the extra days in view 1 are historical.
- No extrapolation beyond available forecast coverage; disabled/blank missing slots; be aware backend ECMWF currently requests `forecast_days=10` in UTC, so final local date coverage is not guaranteed complete.

## Expandable detailed data table
- ONE collapsible table below charts, initially closed; independent day navigation (previous/next local calendar day), not one table per chart.
- Always ONE DAY at a time and HOURLY rows: normally 24; DST transitions may yield 23 or 25. Show actual available records and unavailable cells, never synthesize fake measurements.
- Allow movement backwards into stored observation history and forwards through up to 10 forecast days subject to API coverage. State bounds based on actual coverage, not an arbitrary UI assumption.
- Use same variable names/colors/order as chart: wind, gust, air temperature, water temperature, cloudiness, rain probability; include measured precipitation amount (mm) for observation periods and actual available forecast precipitation when appropriate and wind direction if available.
- On TODAY clearly identify observed vs forecast rows with explicit `Measured`/`Forecast` text, differentiated row treatments and a prominent NOW divider. NOW is wall-clock boundary; source designation comes from actual record provenance, not simply whether timestamp is past/future. Include source/station timestamps.
- Desktop fully usable; mobile horizontal scroll while keeping time and source understandable. EN/FI labels and accessible disclosure controls.

## Rain radar
- Deferred to a later scope; planned location below the forecast charts, not part of initial MVP.

## API/data constraints known as of repo inspection 2026-10-15
- `GET /api/parks`, `/api/parks/{slug}`: park + cables, timezone, coordinates.
- `GET /api/parks/{slug}/weather`: FUTURE forecasts only; snapshot freshness/coverage metadata; **no public historical-observation route currently**.
- `GET /api/parks/{slug}/water-temperature`: latest observed value only; not water-temperature history. Proposed new read-only endpoints `/api/parks/{slug}/weather/observations` and `/api/parks/{slug}/water-temperature/history` are PREPARED in a separate patch bundle, NOT yet applied to GitHub.
- Forecast points contain temperature, wind speed/gust/direction, precipitation amount, nullable precipitation probability, cloudiness, timestamp, source. FMI edited Scandinavia forecast nominally spans 10 days (240h) and may supply `PoP` at individual timestamps, but its non-null coverage must be verified. ECMWF path forces `precipitation_probability=None` and requests 10 forecast days. Use available non-null FMI PoP ONLY; do not substitute 0% or another provider.
- Stored FMI weather observations: temperature, wind speed/gust/direction, precipitation, cloudiness, timestamp; no observed rain probability.
- Stored water-temperature time series exists; latest-only public API. Observation source for Laguuni is Helsinki Kaisaniemi and water source is Lauttasaaren mattolaituri (according to repo seed data), NOT on-park sensors.
- Before implementing charts, Work must audit coverage and implement explicit, tested read-only backend contracts for observations and historical water temperature; use non-null FMI PoP where available and preserve explicit missing-data semantics. Do not silently substitute forecast for measurement or another weather provider.

## Approved additions, October 15 2026
- Rain probability: show ONLY for actual non-null FMI PoP timestamps; no new rain probability provider. FMI official edited Scandinavia forecast is a 10-day product, though data completeness must be tested.
- Source info icon (`!` in circle) is clickable near current readings; reveals weather-station and water-temperature-station locations, provider and update timestamps.
- Include actual measured precipitation in mm in tooltip and collapsible detailed data-point table.
- Water-temperature line ends at the latest real measurement; future chart has NO water-temperature line.
- Prepare backend history routes on a dedicated feature branch in Work mode; patch files can be supplied; never claim they are integrated until tested.
