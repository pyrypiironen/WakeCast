import assert from "node:assert/strict";
import { test } from "node:test";

import { selectDailyWater } from "../src/lib/daily-water";
import type { DailyWeatherData } from "../src/lib/daily-weather";
import type { WaterTemperatureHistoryPoint } from "../src/types/weather";

function reading(
  timestamp: string,
  waterTemperature: number,
): WaterTemperatureHistoryPoint {
  return {
    timestamp,
    fetched_at: timestamp,
    water_temperature: waterTemperature,
  };
}

function input(
  observations: WaterTemperatureHistoryPoint[],
  preceding: WaterTemperatureHistoryPoint | null = null,
  requestedAt = "2026-10-16T12:00:00Z",
): Pick<DailyWeatherData, "requestedAt" | "water"> {
  return {
    requestedAt,
    water: {
      status: "ok",
      data: {
        observation_location: "Test water station",
        source: "uiras",
        source_station_id: "test-water",
        latitude: 60.17,
        longitude: 24.85,
        timezone: "Europe/Helsinki",
        observations,
        preceding_observation: preceding,
      },
    },
  };
}

test("held intervals retain real sample timestamps and stop at reference time", () => {
  const earlier = reading("2026-10-15T20:00:00Z", 10);
  const measured = reading("2026-10-16T08:00:00Z", 11);

  const result = selectDailyWater(
    input([
      measured,
      reading("2026-10-16T13:00:00Z", 99),
    ], earlier),
    "2026-10-16",
    "Europe/Helsinki",
  );

  assert.equal(result.water.status, "ok");
  if (result.water.status !== "ok") assert.fail("Expected water data");

  assert.deepEqual(result.water.data.observations, [measured]);
  assert.deepEqual(result.water.data.preceding_observation, earlier);
  assert.deepEqual(result.water.data.heldIntervals, [
    {
      start: "2026-10-15T21:00:00.000Z",
      end: "2026-10-16T08:00:00.000Z",
      waterTemperature: 10,
      observedAt: earlier.timestamp,
      fetchedAt: earlier.fetched_at,
    },
    {
      start: "2026-10-16T08:00:00.000Z",
      end: "2026-10-16T12:00:00.000Z",
      waterTemperature: 11,
      observedAt: measured.timestamp,
      fetchedAt: measured.fetched_at,
    },
  ]);
});

test("without a preceding reading, the line starts at the first real sample", () => {
  const measured = reading("2026-10-16T08:00:00Z", 11);
  const result = selectDailyWater(
    input([measured]),
    "2026-10-16",
    "Europe/Helsinki",
  );

  assert.equal(result.water.status, "ok");
  if (result.water.status !== "ok") assert.fail("Expected water data");

  assert.equal(result.water.data.preceding_observation, null);
  assert.equal(result.water.data.heldIntervals.length, 1);
  assert.equal(
    result.water.data.heldIntervals[0].start,
    "2026-10-16T08:00:00.000Z",
  );
});

test("future days do not carry water readings forward", () => {
  const result = selectDailyWater(
    input([reading("2026-10-16T08:00:00Z", 11)]),
    "2026-10-17",
    "Europe/Helsinki",
  );

  assert.equal(result.water.status, "ok");
  if (result.water.status !== "ok") assert.fail("Expected water data");

  assert.deepEqual(result.water.data.observations, []);
  assert.deepEqual(result.water.data.heldIntervals, []);
  assert.equal(result.water.data.preceding_observation, null);
});

test("autumn DST day uses its latest preceding reading for the full 25 hours", () => {
  const older = reading("2026-10-23T10:00:00Z", 9);
  const latest = reading("2026-10-24T20:00:00Z", 10);

  const result = selectDailyWater(
    input([latest], older, "2026-10-26T12:00:00Z"),
    "2026-10-25",
    "Europe/Helsinki",
  );

  assert.equal(result.water.status, "ok");
  if (result.water.status !== "ok") assert.fail("Expected water data");

  assert.deepEqual(result.water.data.observations, []);
  assert.deepEqual(result.water.data.preceding_observation, latest);

  const [interval] = result.water.data.heldIntervals;
  assert.equal(interval.observedAt, latest.timestamp);
  assert.equal(interval.waterTemperature, 10);
  assert.equal(
    (Date.parse(interval.end) - Date.parse(interval.start)) / 3_600_000,
    25,
  );
});

test("empty history and failed sources remain distinct", () => {
  const empty = selectDailyWater(
    input([]),
    "2026-10-16",
    "Europe/Helsinki",
  );

  assert.equal(empty.water.status, "ok");
  if (empty.water.status !== "ok") assert.fail("Expected successful history");
  assert.deepEqual(empty.water.data.heldIntervals, []);

  for (const failure of [
    { status: "unavailable", httpStatus: 503 },
    { status: "error", httpStatus: null },
  ] as const) {
    const result = selectDailyWater(
      {
        requestedAt: "2026-10-16T12:00:00Z",
        water: failure,
      },
      "2026-10-16",
      "Europe/Helsinki",
    );

    assert.deepEqual(result.water, failure);
  }
});