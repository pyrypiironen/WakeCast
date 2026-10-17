import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildLineSeries,
  createChartScale,
  measuredForecastBridge,
  splitLineSegments,
  type ChartPoint,
} from "../src/lib/chart-lines";

function point(
  minute: number,
  value: number | null,
  source = "fmi",
  intervalMinutes: number | null = 10,
): ChartPoint {
  return {
    timestamp: new Date(Date.UTC(2026, 9, 16, 10, minute)).toISOString(),
    value,
    source,
    intervalMinutes,
  };
}

test("null measurements and missing timestamps split lines", () => {
  const segments = splitLineSegments([
    point(0, 4),
    point(10, 5),
    point(20, null),
    point(30, 6),
    point(50, 7),
  ]);

  assert.deepEqual(
    segments.map((segment) => segment.map((item) => item.value)),
    [[4, 5], [6], [7]],
  );
});

test("source and sampling-interval changes split lines", () => {
  const segments = splitLineSegments([
    point(0, 4),
    point(10, 5, "other-station"),
    point(20, 6, "other-station", 60),
    point(30, 7, "other-station", null),
    point(40, 8, "other-station", null),
  ]);

  assert.deepEqual(
    segments.map((segment) => segment.length),
    [1, 1, 1, 1, 1],
  );
});

test("zero is valid and input order is not modified", () => {
  const points = [point(10, 0), point(0, 1)];
  const original = structuredClone(points);

  const segments = splitLineSegments(points);

  assert.deepEqual(
    segments[0].map((item) => item.value),
    [1, 0],
  );
  assert.deepEqual(points, original);
});

test("hourly forecasts connect only across available hourly samples", () => {
  const segments = splitLineSegments([
    point(0, 4, "ecmwf", 60),
    point(60, 5, "ecmwf", 60),
    point(180, 6, "ecmwf", 60),
  ]);

  assert.deepEqual(
    segments.map((segment) => segment.map((item) => item.value)),
    [[4, 5], [6]],
  );
});

assert.deepEqual(createChartScale([null], 0, 20), {
  min: 0,
  max: 20,
  ticks: [0, 5, 10, 15, 20],
});

assert.deepEqual(createChartScale([], 0, 40), {
  min: 0,
  max: 40,
  ticks: [0, 10, 20, 30, 40],
});

test("scales include strong gusts and negative temperatures", () => {
  const wind = createChartScale([4, 23, null], 0, 15);
  assert.ok(wind.min <= 0);
  assert.ok(wind.max >= 23);

  const temperature = createChartScale([-12, 8, 42], 0, 40);
  assert.ok(temperature.min <= -12);
  assert.ok(temperature.max >= 42);

  assert.equal(temperature.ticks[0], temperature.min);
  assert.equal(temperature.ticks.at(-1), temperature.max);
});

test("non-finite measurements break lines and do not distort scales", () => {
  const segments = splitLineSegments([
    point(0, 4),
    point(10, Number.NaN),
    point(20, 5),
  ]);

  assert.deepEqual(
    segments.map((segment) => segment.length),
    [1, 1],
  );

  assert.deepEqual(
    createChartScale([Number.NaN, Infinity, null], 0, 15),
    createChartScale([], 0, 15),
  );
});

test("a source-only transition is distinguishable from missing samples", () => {
  const result = buildLineSeries([
    point(0, 4, "fmi_edited", 60),
    point(60, 5, "ecmwf", 60),
  ]);

  assert.deepEqual(
    result.segments.map((segment) => segment.length),
    [1, 1],
  );
  assert.equal(result.breaks.length, 1);
  assert.deepEqual(result.breaks[0].reasons, ["source-change"]);
  assert.equal(result.breaks[0].fromSource, "fmi_edited");
  assert.equal(result.breaks[0].toSource, "ecmwf");
});

test("source changes do not conceal missing forecast samples", () => {
  const result = buildLineSeries([
    point(0, 4, "fmi_edited", 60),
    point(180, 5, "ecmwf", 60),
  ]);

  assert.deepEqual([...result.breaks[0].reasons].sort(), [
    "missing-sample",
    "source-change",
  ]);
});

test("null measurements retain their break reason and surrounding timestamps", () => {
  const before = point(0, 4);
  const after = point(20, 5);

  const result = buildLineSeries([before, point(10, null), after]);

  assert.equal(result.breaks.length, 1);
  assert.ok(result.breaks[0].reasons.includes("missing-value"));
  assert.equal(result.breaks[0].from, Date.parse(before.timestamp));
  assert.equal(result.breaks[0].to, Date.parse(after.timestamp));
});

test("leading and trailing missing values retain open-ended gaps", () => {
  const result = buildLineSeries([
    point(0, null),
    point(10, 4),
    point(20, null),
  ]);

  assert.equal(result.breaks.length, 2);
  assert.equal(result.breaks[0].from, null);
  assert.equal(result.breaks[0].to, Date.parse(point(10, 4).timestamp));
  assert.equal(result.breaks[1].from, Date.parse(point(10, 4).timestamp));
  assert.equal(result.breaks[1].to, null);
});

test("invalid timestamps are reported without inventing a position", () => {
  const result = buildLineSeries([
    point(0, 4),
    { ...point(10, 5), timestamp: "invalid" },
    point(20, 6),
  ]);

  assert.deepEqual(
    result.segments.map((segment) => segment.length),
    [1, 1],
  );
  assert.ok(
    result.breaks.some(
      (gap) =>
        gap.from === null &&
        gap.to === null &&
        gap.reasons.includes("invalid-timestamp"),
    ),
  );
});

test("measurement-to-forecast transition preserves valid gaps", () => {
  const observation = {
    timestamp: "2026-10-16T10:50:00Z",
    value: 5,
    source: "fmi",
    intervalMinutes: 10,
  };

  const forecast = {
    timestamp: "2026-10-16T11:00:00Z",
    value: 7,
    source: "ecmwf",
    intervalMinutes: 60,
  };

  const maxGap = 2 * 60 * 60 * 1000;

  assert.deepEqual(measuredForecastBridge(observation, forecast, maxGap), [
    { time: Date.parse(observation.timestamp), value: 5 },
    { time: Date.parse(forecast.timestamp), value: 7 },
  ]);

  // A missing measurement must remain a visible gap.
  assert.equal(
    measuredForecastBridge({ ...observation, value: null }, forecast, maxGap),
    null,
  );

  // Do not bridge a long period without measurements.
  assert.equal(
    measuredForecastBridge(
      { ...observation, timestamp: "2026-10-16T06:00:00Z" },
      forecast,
      maxGap,
    ),
    null,
  );

  // Do not connect a forecast at or before the measurement.
  assert.equal(
    measuredForecastBridge(
      observation,
      { ...forecast, timestamp: observation.timestamp },
      maxGap,
    ),
    null,
  );
});

test("forecast source changes connect without hiding missing data", () => {
  const continuous = buildLineSeries(
    [point(0, 4, "fmi_edited", 60), point(60, 5, "ecmwf", 60)],
    { connectSourceChanges: true },
  );

  assert.deepEqual(
    continuous.segments.map((segment) => segment.map((item) => item.value)),
    [[4, 5]],
  );

  assert.deepEqual(continuous.breaks[0].reasons, ["source-change"]);

  const missing = buildLineSeries(
    [point(0, 4, "fmi_edited", 60), point(180, 5, "ecmwf", 60)],
    { connectSourceChanges: true },
  );

  assert.deepEqual(
    missing.segments.map((segment) => segment.length),
    [1, 1],
  );

  assert.ok(missing.breaks[0].reasons.includes("missing-sample"));
});
