import assert from "node:assert/strict";
import { test } from "node:test";

import { loadDailyWeather } from "../src/lib/daily-weather";

test("history bounds use park-local midnight across autumn DST", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));

    if (url.pathname.endsWith("/weather")) {
      return new Response(null, { status: 503 });
    }

    // October 24 midnight in Helsinki is October 23 at 21:00 UTC.
    // October 27 is already on the winter offset.
    assert.equal(
      url.searchParams.get("start_time"),
      "2026-10-23T21:00:00.000Z",
    );
    assert.equal(
      url.searchParams.get("end_time"),
      "2026-10-27T10:00:00.000Z",
    );

    return new Response(null, { status: 404 });
  });

  const previousBaseUrl = process.env.WAKECAST_API_URL;
  process.env.WAKECAST_API_URL = "http://wakecast.test";
  t.after(() => {
    if (previousBaseUrl === undefined) {
      delete process.env.WAKECAST_API_URL;
    } else {
      process.env.WAKECAST_API_URL = previousBaseUrl;
    }
  });

  const result = await loadDailyWeather(
    "test-park",
    "Europe/Helsinki",
    new Date("2026-10-27T10:00:00Z"),
  );

  assert.equal(result.today, "2026-10-27");
  assert.equal(result.earliestDate, "2026-10-24");
  assert.equal(result.latestDate, "2026-11-06");
  assert.deepEqual(result.forecasts, {
    status: "unavailable",
    httpStatus: 503,
  });
});

test("empty history, unavailable data and network errors remain distinct", async (t) => {
  const history = {
    station_name: "Test station",
    source: "fmi",
    source_station_id: 123,
    timezone: "Europe/Helsinki",
    observations: [],
  };

  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));

    if (url.pathname.endsWith("/weather/observations")) {
      return Response.json(history);
    }

    if (url.pathname.endsWith("/water-temperature/history")) {
      throw new TypeError("Simulated network failure");
    }

    return new Response(null, { status: 503 });
  });

  const previousBaseUrl = process.env.WAKECAST_API_URL;
  process.env.WAKECAST_API_URL = "http://wakecast.test";
  t.after(() => {
    if (previousBaseUrl === undefined) {
      delete process.env.WAKECAST_API_URL;
    } else {
      process.env.WAKECAST_API_URL = previousBaseUrl;
    }
  });

  const result = await loadDailyWeather(
    "test-park",
    "Europe/Helsinki",
    new Date("2026-10-16T12:00:00Z"),
  );

  assert.deepEqual(result.observations, {
    status: "ok",
    data: history,
  });
  assert.deepEqual(result.forecasts, {
    status: "unavailable",
    httpStatus: 503,
  });
  assert.deepEqual(result.water, {
    status: "error",
    httpStatus: null,
  });
});