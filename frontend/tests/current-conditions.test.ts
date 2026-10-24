import assert from "node:assert/strict";
import { test } from "node:test";
import { currentForecastHour, formatCurrentInterval, prepareCurrentConditions } from "../src/lib/current-conditions";
import type { DailyWeatherData } from "../src/lib/daily-weather";
import { fixture, forecast, observation, requestedAt } from "./current-conditions-fixture";

const zone = "Europe/Helsinki";
const select = (data: DailyWeatherData, now = requestedAt) => prepareCurrentConditions(data, new Date(now), zone);

test("latest measured fields, water and current-hour forecast retain independent provenance", () => {
  const data = fixture();
  data.observations.data.observations.push(observation("2026-10-19T19:10:00+03:00", { temperature: null, precipitation: null }));
  data.observations.data.observations.unshift(observation("2026-10-19T20:00:00+03:00", { temperature: 100 }));
  const before = JSON.stringify(data);
  const result = select(data);
  assert.equal(result.temperature.value, 8.4);
  assert.equal(result.temperature.timestamp, "2026-10-19T19:00:00+03:00");
  assert.equal(result.temperature.olderSample, true);
  assert.equal(result.wind.timestamp, "2026-10-19T19:10:00+03:00");
  assert.equal(result.wind.olderSample, false);
  assert.equal(result.temperature.stationId, 100971);
  assert.equal(result.temperature.location, "Helsinki Kaisaniemi");
  assert.equal(result.water.value, 9.8);
  assert.equal(result.water.location, "Lauttasaaren mattolaituri");
  assert.equal(result.probability.kind, "forecast");
  assert.equal(result.probability.value, 20);
  assert.equal(result.probability.location, "Karhusaari");
  assert.equal(result.probability.source, "fmi_edited");
  assert.equal(formatCurrentInterval(result.rain.interval!, zone, "en"), "18:00–19:00");
  assert.equal(formatCurrentInterval(result.probability.interval!, zone, "en"), "19:00–20:00");
  assert.equal(JSON.stringify(data), before);
});

test("missing values stay missing, valid zeroes survive, forecasts never fill measurements", () => {
  const data = fixture();
  data.observations.data.observations = [observation("2026-10-19T19:00:00+03:00", {
    temperature: null, wind_speed: 0, wind_gust: 0, cloudiness: 0, precipitation: 0,
  })];
  data.forecasts.data.forecasts[0].precipitation_probability = 0;
  let result = select(data);
  assert.equal(result.temperature.value, null);
  for (const key of ["wind", "gust", "cloud", "rain", "probability"] as const) assert.equal(result[key].value, 0);
  data.forecasts.data.forecasts[0].precipitation_probability = null;
  data.forecasts.data.forecasts[0].source = "ecmwf";
  result = select(data);
  assert.equal(result.probability.value, null);
  assert.equal(result.probability.source, "ecmwf");
  data.forecasts.data.forecasts.shift();
  assert.equal(select(data).probability.value, null); // Never borrow next hour.
});

test("rain labels follow the actual precipitation1h endpoint, not a fabricated clock-hour sum", () => {
  const data = fixture();
  data.observations.data.observations.push(observation("2026-10-19T19:10:00+03:00", { precipitation: 0.2 }));
  assert.equal(select(data).rain.value, 0.2);
  assert.equal(formatCurrentInterval(select(data).rain.interval!, zone, "fi"), "18:10–19:10");
  data.observations.data.observations = [observation("2026-10-19T19:10:00+03:00", { is_aggregated: true })];
  assert.equal(select(data).rain.value, null);
  data.observations.data.observations[0].is_aggregated = false;
  data.observations.data.observations[0].precipitation = -1;
  assert.equal(select(data).rain.value, null);
});

test("invalid probability and non-finite measurements are unavailable, not invented", () => {
  const data = fixture();
  data.observations.data.observations[0].temperature = Number.NaN;
  assert.equal(select(data).temperature.value, null);
  for (const value of [-1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
    data.forecasts.data.forecasts[0].precipitation_probability = value;
    assert.equal(select(data).probability.value, null);
  }
});

test("stale thresholds use sample timestamps; fetching old data does not make it fresh", () => {
  const data = fixture();
  const result = select(data, "2026-10-19T21:00:01+03:00");
  assert.equal(result.temperature.stale, true);
  assert.equal(result.water.stale, true);
  assert.equal(select(data, "2026-10-19T19:38:00+03:00").probability.stale, true);
  assert.equal(select(data).water.stale, false);
});

test("water preceding observation remains a dated stale measurement; future samples ignored", () => {
  const data: DailyWeatherData = fixture();
  if (data.water.status !== "ok") throw new Error("fixture");
  data.water.data.preceding_observation = { timestamp: "2026-10-14T12:00:00+03:00", fetched_at: requestedAt, water_temperature: 0 };
  data.water.data.observations = [{ timestamp: "2026-10-20T12:00:00+03:00", fetched_at: requestedAt, water_temperature: 100 }];
  assert.equal(select(data).water.value, 0);
  assert.equal(select(data).water.stale, true);
});

test("source errors, unavailable sources and empty successes remain distinct", () => {
  const data: DailyWeatherData = fixture();
  data.observations = { status: "error", httpStatus: 500 };
  data.water = { status: "unavailable", httpStatus: 404 };
  data.forecasts = { status: "unavailable", httpStatus: 503 };
  const result = select(data);
  assert.equal(result.temperature.status, "error");
  assert.equal(result.water.status, "unavailable");
  assert.equal(result.probability.value, null);
  const empty = fixture();
  empty.observations.data.observations = [];
  assert.equal(select(empty).temperature.status, "ok");
  assert.equal(select(empty).temperature.value, null);
});

for (const [now, start] of [
  ["2026-10-19T23:59:59.999+03:00", "2026-10-19T23:00:00+03:00"],
  ["2026-10-20T00:00:00+03:00", "2026-10-20T00:00:00+03:00"],
  ["2026-03-29T02:59:00+02:00", "2026-03-29T02:00:00+02:00"],
  ["2026-03-29T04:01:00+03:00", "2026-03-29T04:00:00+03:00"],
  ["2026-10-25T03:20:00+03:00", "2026-10-25T03:00:00+03:00"],
  ["2026-10-25T03:20:00+02:00", "2026-10-25T03:00:00+02:00"],
]) {
  test(`current hour at ${now} respects Helsinki midnight/DST`, () => {
    const hour = currentForecastHour(new Date(now), zone);
    assert.equal(hour.start, Date.parse(start));
    assert.equal(hour.end - hour.start, 3_600_000);
    const data = fixture();
    data.forecasts.data.forecasts = [forecast(start)];
    assert.equal(select(data, now).probability.timestamp, start);
  });
}

test("both repeated autumn forecast hours are distinct and labelled with offsets", () => {
  const data = fixture();
  data.forecasts.data.forecasts = [forecast("2026-10-25T03:00:00+03:00"), forecast("2026-10-25T03:00:00+02:00", { precipitation_probability: 60 })];
  assert.equal(select(data, "2026-10-25T03:15:00+03:00").probability.value, 20);
  const second = select(data, "2026-10-25T03:15:00+02:00").probability;
  assert.equal(second.value, 60);
  assert.match(formatCurrentInterval(second.interval!, zone, "en"), /GMT\+2/);
});
