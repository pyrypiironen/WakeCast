# Frontend API contract audit — 2026-10-15

Source inspected: GitHub `pyrypiironen/WakeCast` revision
`034196b802ac9d06b138e30deacc8ee8d3fcf1e3`.
Read-only source audit of `backend/app/main.py`, `routes/history.py`, response
models, database relationships, seed data, and forecast merge/storage/provider code.
No backend code or database changes were made.

## Verification boundary

All six public park read routes below exist in this revision; the history router
is registered. The user reports 354 backend tests passing and Ruff clean after
pushing the history implementation. That suite was not rerun in this frontend task.

There is no reachable live FastAPI server in this environment (`127.0.0.1:8000`
refused connection), and no deployed API URL was supplied. Actual response samples,
current database station assignments, forecast horizon, freshness and non-null FMI
rain-probability counts remain unverified. Seed values are not proof of live data.
Step 1.4 must stay open for these live checks.

## Public read endpoints

Paths below are relative to `/api/parks`.

| Route | Successful payload | Missing / unavailable behavior |
| --- | --- | --- |
| `/` (without trailing slash in client) | `Park[]` | An empty array is valid; the route returns all parks, including inactive parks |
| `/{slug}` | `Park`, including cables | Unknown park: 404 |
| `/{slug}/weather` | `forecast_location`, `forecasts`, `fetched_at`, `coverage_start`, `coverage_end` | Missing snapshot: 404; stale snapshot or no upcoming points: 503 |
| `/{slug}/weather/observations` | `station_name`, `source`, numeric `source_station_id`, park `timezone`, `observations` | Unconfigured station: 404; inactive station: 503; valid empty range: 200 with `[]` |
| `/{slug}/water-temperature` | Station source/ID/name/coordinates, `timestamp`, `fetched_at`, `water_temperature`, `is_stale` | Unconfigured station or no reading: 404; inactive station: 503; stale reading is returned with `is_stale: true` |
| `/{slug}/water-temperature/history` | Station source/string ID/name/coordinates, park `timezone`, `observations`, nullable `preceding_observation` | Unconfigured station: 404; inactive station: 503; empty observations are valid even if a preceding sample exists |

The TypeScript wire interfaces in `src/types/park.ts` and `src/types/weather.ts`
match the Pydantic response fields. No provider calls or privileged endpoints are
exposed through the frontend API client. JSON is typed at the application boundary;
the client does not provide full runtime schema validation.

## Stations and park metadata

- Park responses include coordinates, IANA timezone, sea/lake type, active flag,
  website URL and nullable Finnish website URL. Cable name and Finnish booking URL
  are nullable; the default booking URL is required. Display fallback remains the
  default URL when the Finnish variant is absent.
- `ParkDB.observation_station_id` and `water_temperature_station_id` are separate
  nullable foreign keys. History queries filter by the assigned station's internal
  ID, not by park coordinates or nearest-station guesses.
- Seed data assigns Laguuni Keilaniemi to Helsinki Kaisaniemi (FMI, 100971) and
  Lauttasaaren mattolaituri (UIRA). These are nearby station readings, not on-park sensors.
- Weather history includes each row's source, stored observation location,
  resolution and aggregation flag. Water history carries source/station metadata
  at response level, not on each sample. The park response itself has no station fields.

## Forecast coverage and missing values

- Weather returns future points only (`timestamp >= now`), merged with FMI taking
  precedence over ECMWF at overlapping timestamps; legacy `harmonie` is accepted.
- Forecast freshness is based on snapshot `fetched_at`, with an allowed age of
  zero to 30 minutes. Coverage start/end are first/last returned point timestamps,
  not a guarantee that every intervening slot or final local day is complete.
- ECMWF requests `forecast_days=10` and currently sets precipitation probability
  to `None`. FMI maps `PoP` when available. Code does not establish a guaranteed
  240-hour populated FMI response; measure actual returned points before promising it.
- All forecast weather numbers are required except nullable precipitation probability.
  Weather observations allow null weather fields and have **no precipitation probability**.
  Zero precipitation/probability is not interchangeable with null.
- Water-temperature values are measured, never forecasts. A preceding sample may
  be older than the selected range; preserve its timestamp, and do not extend a
  water line past the latest real measurement. Composition is deferred to Section 3.

## Timestamp and range semantics

- Both history routes require offset-aware `start_time` and `end_time`, normalize
  them to UTC, use `[start,end)`, and cap elapsed range length at 31 × 24 hours.
  Invalid ranges produce 422. Unknown parks can take precedence through dependency
  resolution; callers must handle both validation and resource errors.
- Future history is excluded. Weather history clamps the exclusive end to now;
  water history also omits a preceding sample when the requested start is future.
- Preserve actual `timestamp` separately from ingestion `fetched_at`. Do not
  classify records as measured merely because their timestamp is before now.
- Forecast timestamps are Python `datetime`; history/latest-water schemas enforce
  aware datetimes. Storage uses timezone-aware columns. Frontend formatting rejects
  naive strings rather than interpreting them in the machine's timezone.
- `localDayRange` returns UTC instants for the chosen IANA local calendar day;
  Helsinki spring/autumn transitions yield 23/25 hours. Displayed times include
  the UTC offset so repeated autumn hours remain distinguishable.
- History has no global earliest/latest-available bounds or explicit staleness flag.
  Empty results cannot establish the total available history. Latest water is
  stale after two hours; history freshness must be assessed from real sample times.

## Reusable frontend infrastructure

- `AppHeader` lives in the existing locale root layout; one main landmark and a
  localized skip link wrap current and future pages. The pre-existing simple park
  names/count remain; no Section 2 park rows or detail routes were added.
- `LanguageSwitcher` retains the pathname while changing its locale prefix.
- `api.ts` retains server-side `WAKECAST_API_URL`, no-store reads, encoded slugs,
  a ten-second timeout, and distinguishable HTTP errors (`ApiError.status/detail`).
  Empty arrays/nulls remain unchanged; transport/JSON failures propagate.
- `format.ts` supplies EN/FI units, missing-value dashes, eight-point meteorological
  FROM compass directions and explicit measured/forecast labels.
- `date.ts` supplies aware parsing, local date keys, local date/time formatting,
  calendar-day arithmetic and DST-aware day boundaries using built-in `Intl`.
- `npm test` compiles utility/API tests and uses Node's built-in test runner.
  No additional package dependency was introduced.

## Remaining live checks for 1.4

1. Read park, forecast, latest water, and both history responses from the actual API.
2. Confirm returned station identities and timezone match the intended park configuration.
3. Record first/last forecast timestamps, gaps and per-source/non-null PoP counts;
   convert coverage to local dates without assuming ten complete local days.
4. Check actual sample/fetch ages and empty/stale behavior without triggering refreshes.

Sections 2 and 3 remain outside this task.
