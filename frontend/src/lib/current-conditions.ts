import type { DailyWeatherData, WeatherDataResult } from "./daily-weather";
import { formatLocalTime, parseTimestamp } from "./date";
import type { Locale } from "./i18n";
import type { WeatherObservationHistoryPoint } from "../types/weather";

const HOUR_MS = 3_600_000;

export interface CurrentReading {
  value: number | null;
  kind: "measured" | "forecast";
  timestamp: string | null;
  fetchedAt: string | null;
  source: string | null;
  location: string | null;
  stationId: string | number | null;
  stale: boolean;
  /** A newer observation exists but does not contain this measurement. */
  olderSample: boolean;
  status: WeatherDataResult<unknown>["status"];
  interval: { start: number; end: number } | null;
}

function missing(
  status: CurrentReading["status"],
  kind: CurrentReading["kind"] = "measured",
): CurrentReading {
  return { value: null, kind, timestamp: null, fetchedAt: null, source: null,
    location: null, stationId: null, stale: false, olderSample: false, status, interval: null };
}

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

/** Keep the UTC instant of the local hour, including the two autumn 03:00s. */
export function currentForecastHour(now: Date, timeZone: string) {
  const instant = parseTimestamp(now);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const start = instant.getTime() - part("minute") * 60_000 -
    part("second") * 1000 - instant.getUTCMilliseconds();
  return { start, end: start + HOUR_MS };
}

/** Compact labels normally; include offsets across DST and in repeated hours. */
export function formatCurrentInterval(
  interval: { start: number; end: number }, timeZone: string, locale: Locale,
): string {
  const formatter = new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const clock = (time: number) => formatter.format(new Date(time)).replace(".", ":");
  const offset = (time: number) => new Intl.DateTimeFormat("en-GB", {
    timeZone, timeZoneName: "shortOffset",
  }).formatToParts(new Date(time)).find((p) => p.type === "timeZoneName")?.value;
  const repeated = [interval.start, interval.end].some((time) =>
    clock(time) === clock(time - HOUR_MS) || clock(time) === clock(time + HOUR_MS));
  if (repeated || offset(interval.start) !== offset(interval.end)) {
    return `${formatLocalTime(new Date(interval.start), timeZone, locale)}–${formatLocalTime(new Date(interval.end), timeZone, locale)}`;
  }
  return `${clock(interval.start)}–${clock(interval.end)}`;
}

/** Read-only selection from the same payloads used by the daily chart. */
export function prepareCurrentConditions(data: DailyWeatherData, now: Date, timeZone: string) {
  const nowMs = parseTimestamp(now).getTime();
  const weather = data.observations;
  const observations = weather.status === "ok" ? weather.data.observations
    .filter((point) => Date.parse(point.timestamp) <= nowMs)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)) : [];

  function measured(field: "temperature" | "wind_speed" | "wind_gust" | "cloudiness" | "precipitation") {
    const valid = (point: WeatherObservationHistoryPoint) => finite(point[field]) &&
      (field !== "precipitation" || (!point.is_aggregated && point.source === "fmi" && point[field]! >= 0));
    const point = observations.find(valid);
    if (!point || weather.status !== "ok") return missing(weather.status);
    const end = Date.parse(point.timestamp);
    return {
      value: point[field], kind: "measured", timestamp: point.timestamp,
      fetchedAt: point.fetched_at, source: point.source, location: point.observation_location,
      stationId: weather.data.source_station_id, stale: nowMs - end > HOUR_MS,
      olderSample: end < Date.parse(observations[0].timestamp), status: weather.status,
      // FMI precipitation1h is the preceding hour ending at the sample, not a 10-minute total.
      interval: field === "precipitation" ? { start: end - HOUR_MS, end } : null,
    } satisfies CurrentReading;
  }

  let water = missing(data.water.status);
  if (data.water.status === "ok") {
    const response = data.water.data;
    const point = [...response.observations, ...(response.preceding_observation ? [response.preceding_observation] : [])]
      .filter((p) => Date.parse(p.timestamp) <= nowMs && finite(p.water_temperature))
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
    if (point) water = {
      ...water, value: point.water_temperature, timestamp: point.timestamp, fetchedAt: point.fetched_at,
      source: response.source, location: response.observation_location, stationId: response.source_station_id,
      stale: nowMs - Date.parse(point.timestamp) > 2 * HOUR_MS,
    };
  }

  const hour = currentForecastHour(now, timeZone);
  let probability = { ...missing(data.forecasts.status, "forecast"), interval: hour };
  // The API already resolves FMI/ECMWF precedence, including current-hour fallback.
  const forecast = data.forecasts.status === "ok"
    ? data.forecasts.data.forecasts.find((p) => Date.parse(p.timestamp) === hour.start) ?? null : null;
  if (forecast && data.forecasts.status === "ok") {
    probability = {
      ...probability, value: finite(forecast.precipitation_probability) &&
        forecast.precipitation_probability >= 0 && forecast.precipitation_probability <= 100
        ? forecast.precipitation_probability : null,
      timestamp: forecast.timestamp, fetchedAt: data.forecasts.data.fetched_at,
      source: forecast.source, location: data.forecasts.data.forecast_location,
      stale: nowMs - Date.parse(data.forecasts.data.fetched_at) > 30 * 60_000,
    };
  }
  return {
    temperature: measured("temperature"), water, wind: measured("wind_speed"), gust: measured("wind_gust"),
    cloud: measured("cloudiness"), rain: measured("precipitation"), probability, forecast,
  };
}
