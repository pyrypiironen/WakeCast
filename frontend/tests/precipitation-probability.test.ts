import assert from "node:assert/strict";
import { test } from "node:test";

import { localDayRange } from "../src/lib/date";
import { buildPrecipitationProbabilityCells } from "../src/lib/precipitation-probability";

const HOUR = 3_600_000;

test("zero probability remains distinct from missing probability", () => {
  const start = Date.parse("2026-10-18T09:00:00Z");

  const cells = buildPrecipitationProbabilityCells(
    [
      {
        timestamp: new Date(start).toISOString(),
        precipitation_probability: 0,
      },
      {
        timestamp: new Date(start + HOUR).toISOString(),
        precipitation_probability: null,
      },
      {
        timestamp: new Date(start + 2 * HOUR).toISOString(),
        precipitation_probability: 75,
      },
    ],
    start,
    start + 4 * HOUR,
    start - HOUR,
  );

  assert.deepEqual(
    cells.map((cell) => cell.probability),
    [0, null, 75, null],
  );
});

test("historical hours do not show forecast probabilities", () => {
  const start = Date.parse("2026-10-18T09:00:00Z");

  const cells = buildPrecipitationProbabilityCells(
    [
      {
        timestamp: new Date(start).toISOString(),
        precipitation_probability: 90,
      },
      {
        timestamp: new Date(start + 2 * HOUR).toISOString(),
        precipitation_probability: 20,
      },
    ],
    start,
    start + 4 * HOUR,
    start + HOUR,
  );

  assert.equal(cells[0].isPast, true);
  assert.equal(cells[0].probability, null);
  assert.equal(cells[2].isPast, false);
  assert.equal(cells[2].probability, 20);
});

test("autumn and spring DST days use their actual hour counts", () => {
  for (const [date, expected] of [
    ["2026-10-25", 25],
    ["2026-03-29", 23],
  ] as const) {
    const { start, end } = localDayRange(date, "Europe/Helsinki");

    const cells = buildPrecipitationProbabilityCells(
      [],
      start.getTime(),
      end.getTime(),
      start.getTime() - HOUR,
    );

    assert.equal(cells.length, expected);
    assert.equal(cells.at(-1)!.time, end.getTime() - HOUR);
  }
});

test("invalid percentages are unavailable rather than fabricated", () => {
  const start = Date.parse("2026-10-18T09:00:00Z");

  const cells = buildPrecipitationProbabilityCells(
    [
      {
        timestamp: new Date(start).toISOString(),
        precipitation_probability: 110,
      },
    ],
    start,
    start + HOUR,
    start - HOUR,
  );

  assert.equal(cells[0].probability, null);
});