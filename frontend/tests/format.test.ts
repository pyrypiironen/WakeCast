import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatTemperature,
  formatWindSpeed,
  formatPrecipitation,
  formatPercentage,
  formatWindDirection,
  formatProvenance,
} from "../src/lib/format";

test("missing or invalid measurements are never formatted as zero", () => {
  for (const format of [
    formatTemperature,
    formatWindSpeed,
    formatPrecipitation,
    formatPercentage,
    formatWindDirection,
  ]) {
    for (const value of [null, undefined, NaN, Infinity])
      assert.equal(format(value), "—");
  }
  assert.equal(formatPercentage(0), "0 %");
  assert.equal(formatPrecipitation(0), "0 mm");
});

test("units, negative temperatures and localized decimals", () => {
  assert.equal(formatTemperature(-2.5), "-2.5 °C");
  assert.equal(formatTemperature(12.5, "fi"), "12,5 °C");
  assert.equal(formatWindSpeed(4.5), "4.5 m/s");
  assert.equal(formatPrecipitation(1.2), "1.2 mm");
});

test("meteorological FROM compass boundaries and normalization", () => {
  for (const value of [0, 360, 720, -360])
    assert.equal(formatWindDirection(value), "N");
  assert.equal(formatWindDirection(22.49), "N");
  assert.equal(formatWindDirection(22.5), "NE");
  assert.equal(formatWindDirection(-90), "W");
  assert.equal(formatWindDirection(180, "fi"), "E");
});

test("provenance labels require an explicit kind", () => {
  assert.equal(formatProvenance("measured"), "Measured");
  assert.equal(formatProvenance("forecast", "fi"), "Ennuste");
});
