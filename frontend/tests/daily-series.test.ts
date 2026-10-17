import assert from "node:assert/strict";
import { test } from "node:test";

import { selectDailyAirWeather } from "../src/lib/daily-series";
import type { DailyWeatherData } from "../src/lib/daily-weather";
import type {
  WeatherForecast,
  WeatherObservationHistoryPoint,
} from "../src/types/weather";

function observation(
  timestamp: string,
  temperature: number | null = 10,
): WeatherObservationHistoryPoint {
  return {
    timestamp,
    fetched_at: timestamp,
    temperature,
    wind_speed: 4,
    wind_gust: 7,
    wind_direction: 180,
    precipitation: null,
    cloudiness: 50,
    source: "fmi",
    observation_location: "Test station",
    resolution_minutes: 10,
    is_aggregated: false,
  };
}

function forecast(timestamp: string): WeatherForecast {
  return {
    timestamp,
    temperature: 12,
    wind_speed: 5,
    wind_gust: 8,
    wind_direction: 190,
    precipitation: 0,
    precipitation_probability: null,
    cloudiness: 60,
    source: "ecmwf",
  };
}

function input(
  requestedAt: string,
  observations: WeatherObservationHistoryPoint[] = [],
  forecasts: WeatherForecast[] = [],
): Pick<DailyWeatherData, "requestedAt" | "observations" | "forecasts"> {
  return {
    requestedAt,
    observations: {
      status: "ok",
      data: {
        station_name: "Test station",
        source: "fmi",
        source_station_id: 123,
        timezone: "Europe/Helsinki",
        observations,
      },
    },
    forecasts: {
      status: "ok",
      data: {
        forecast_location: "Test forecast location",
        fetched_at: requestedAt,
        coverage_start: forecasts[0]?.timestamp ?? requestedAt,
        coverage_end: forecasts.at(-1)?.timestamp ?? requestedAt,
        forecasts,
      },
    },
  };
}

test("daily selection preserves nulls, gaps, provenance and original arrays", () => {
  const observations = [
    observation("2026-10-16T09:50:00Z"),
    observation("2026-10-16T09:00:00Z", null),
    observation("2026-10-16T10:10:00Z"),
  ];
  const forecasts = [
    forecast("2026-10-16T11:00:00Z"),
    forecast("2026-10-16T09:00:00Z"),
  ];

  const result = selectDailyAirWeather(
    input("2026-10-16T10:00:00Z", observations, forecasts),
    "2026-10-16",
    "Europe/Helsinki",
  );

  assert.equal(result.observations.status, "ok");
  assert.equal(result.forecasts.status, "ok");

  if (result.observations.status !== "ok" || result.forecasts.status !== "ok") {
    assert.fail("Expected successful source results");
  }

  const measured = result.observations.data.observations;
  const predicted = result.forecasts.data.forecasts;

  assert.deepEqual(
    measured.map((point) => point.timestamp),
    ["2026-10-16T09:00:00Z", "2026-10-16T09:50:00Z"],
  );
  assert.equal(measured[0].temperature, null);
  assert.equal(measured[0].precipitation, null);
  assert.equal(measured[0].source, "fmi");

  assert.equal(predicted.length, 1);
  assert.equal(predicted[0].timestamp, "2026-10-16T11:00:00Z");
  assert.equal(predicted[0].precipitation_probability, null);
  assert.equal(predicted[0].source, "ecmwf");

  // No missing samples were invented, and input order is unchanged.
  assert.equal(observations.length, 3);
  assert.equal(observations[0].timestamp, "2026-10-16T09:50:00Z");
  assert.equal(forecasts.length, 2);
});

test("autumn day includes both repeated hours and the next midnight as a closing point", () => {
  const result = selectDailyAirWeather(
    input("2026-10-26T12:00:00Z", [
      observation("2026-10-25T03:30:00+03:00"),
      observation("2026-10-25T03:30:00+02:00"),
      observation("2026-10-26T00:00:00+02:00"),
    ]),
    "2026-10-25",
    "Europe/Helsinki",
  );

  assert.equal(result.durationHours, 25);
  assert.equal(result.start, "2026-10-24T21:00:00.000Z");
  assert.equal(result.end, "2026-10-25T22:00:00.000Z");

  assert.equal(result.observations.status, "ok");
  if (result.observations.status !== "ok") {
    assert.fail("Expected observations");
  }

  assert.deepEqual(
    result.observations.data.observations.map((point) => point.timestamp),
    [
      "2026-10-25T03:30:00+03:00",
      "2026-10-25T03:30:00+02:00",
      "2026-10-26T00:00:00+02:00",
    ],
  );
});

test("spring day has 23 hours and failed sources remain distinct", () => {
  const result = selectDailyAirWeather(
    {
      requestedAt: "2026-03-29T12:00:00Z",
      observations: { status: "error", httpStatus: null },
      forecasts: { status: "unavailable", httpStatus: 503 },
    },
    "2026-03-29",
    "Europe/Helsinki",
  );

  assert.equal(result.durationHours, 23);
  assert.equal(result.start, "2026-03-28T22:00:00.000Z");
  assert.equal(result.end, "2026-03-29T21:00:00.000Z");
  assert.deepEqual(result.observations, {
    status: "error",
    httpStatus: null,
  });
  assert.deepEqual(result.forecasts, {
    status: "unavailable",
    httpStatus: 503,
  });
});

test("forecast includes next midnight as a closing point, but nothing later", () => {
  const result = selectDailyAirWeather(
    input(
      "2026-10-16T10:00:00Z",
      [],
      [
        forecast("2026-10-16T23:00:00+03:00"),
        forecast("2026-10-17T00:00:00+03:00"),
        forecast("2026-10-17T01:00:00+03:00"),
      ],
    ),
    "2026-10-16",
    "Europe/Helsinki",
  );

  assert.equal(result.forecasts.status, "ok");
  if (result.forecasts.status !== "ok") {
    assert.fail("Expected forecasts");
  }

  assert.deepEqual(
    result.forecasts.data.forecasts.map((point) => point.timestamp),
    ["2026-10-16T23:00:00+03:00", "2026-10-17T00:00:00+03:00"],
  );
});

test("forecast closing midnight uses the winter offset on the autumn DST day", () => {
  const result = selectDailyAirWeather(
    input(
      "2026-10-24T12:00:00Z",
      [],
      [
        forecast("2026-10-25T23:00:00+02:00"),
        forecast("2026-10-26T00:00:00+02:00"),
        forecast("2026-10-26T01:00:00+02:00"),
      ],
    ),
    "2026-10-25",
    "Europe/Helsinki",
  );

  assert.equal(result.durationHours, 25);
  assert.equal(result.forecasts.status, "ok");
  if (result.forecasts.status !== "ok") {
    assert.fail("Expected forecasts");
  }

  assert.deepEqual(
    result.forecasts.data.forecasts.map((point) => point.timestamp),
    ["2026-10-25T23:00:00+02:00", "2026-10-26T00:00:00+02:00"],
  );
});

test("observations include next midnight as a closing point", () => {
  const result = selectDailyAirWeather(
    input("2026-10-17T00:30:00+03:00", [
      observation("2026-10-16T23:50:00+03:00"),
      observation("2026-10-17T00:00:00+03:00"),
      observation("2026-10-17T00:10:00+03:00"),
    ]),
    "2026-10-16",
    "Europe/Helsinki",
  );

  assert.equal(result.observations.status, "ok");

  if (result.observations.status !== "ok") {
    assert.fail("Expected observations");
  }

  assert.deepEqual(
    result.observations.data.observations.map((point) => point.timestamp),
    ["2026-10-16T23:50:00+03:00", "2026-10-17T00:00:00+03:00"],
  );
});
