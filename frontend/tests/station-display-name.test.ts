import assert from "node:assert/strict";
import { test } from "node:test";

import { weatherStationDisplayName } from "../src/lib/station-display-name";

test("mapped weather station uses its compact name without changing API metadata", () => {
  const station = {
    source: "fmi",
    source_station_id: 100971,
    station_name: "Helsinki Kaisaniemi",
  };

  assert.equal(weatherStationDisplayName(station), "Kaisaniemi");
  assert.equal(station.station_name, "Helsinki Kaisaniemi");
});

test("unmapped stations retain their complete API names", () => {
  assert.equal(
    weatherStationDisplayName({
      source: "fmi",
      source_station_id: 999999,
      station_name: "Weather station A",
    }),
    "Weather station A",
  );
});

test("station IDs are scoped to their provider", () => {
  assert.equal(
    weatherStationDisplayName({
      source: "another-provider",
      source_station_id: 100971,
      station_name: "Another station",
    }),
    "Another station",
  );
});