import assert from "node:assert/strict";
import { test } from "node:test";

import { localDayRange } from "../src/lib/date";
import {
  buildPrecipitationProbabilityCells,
  getMissingPrecipitationProbabilityRanges,
} from "../src/lib/precipitation-probability";


const HOUR = 3_600_000;

test("zero probability remains distinct from missing probability", () => {
  const start = Date.parse("2026-10-18T09:00:00Z");

  const cells = buildPrecipitationProbabilityCells(
    [
      {
        timestamp: new Date(start).toISOString(),
        precipitation_probability: 0,
        source: "fmi_edited",
      },
      {
        timestamp: new Date(start + HOUR).toISOString(),
        precipitation_probability: null,
        source: "fmi_edited",
      },
      {
        timestamp: new Date(start + 2 * HOUR).toISOString(),
        precipitation_probability: 75,
        source: "fmi_edited",
      },
      {
        timestamp: new Date(start + 3 * HOUR).toISOString(),
        precipitation_probability: null,
        source: "fmi_edited",
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
        source: "fmi_edited",
      },
      {
        timestamp: new Date(start + 2 * HOUR).toISOString(),
        precipitation_probability: 20,
        source: "fmi_edited",
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

test("current hour remains visible until the next hour starts", () => {
  const start = Date.parse("2026-10-18T16:00:00Z");

  const forecasts = [
    {
      timestamp: new Date(start).toISOString(),
      precipitation_probability: 40,
      source: "fmi_edited" as const,
    },
    {
      timestamp: new Date(start + HOUR).toISOString(),
      precipitation_probability: 60,
      source: "fmi_edited" as const,
    },
  ];

  const duringHour = buildPrecipitationProbabilityCells(
    forecasts,
    start,
    start + 2 * HOUR,
    start + 11 * 60_000,
  );

  assert.equal(duringHour[0].isPast, false);
  assert.equal(duringHour[0].probability, 40);

  const afterHour = buildPrecipitationProbabilityCells(
    forecasts,
    start,
    start + 2 * HOUR,
    start + HOUR,
  );

  assert.equal(afterHour[0].isPast, true);
  assert.equal(afterHour[0].probability, null);
  assert.equal(afterHour[1].isPast, false);
  assert.equal(afterHour[1].probability, 60);
});

test("autumn and spring DST days use their actual hour counts", () => {
  for (const [date, expected] of [
    ["2026-10-25", 25],
    ["2026-03-29", 23],
  ] as const) {
    const { start, end } = localDayRange(date, "Europe/Helsinki");

    const cells = buildPrecipitationProbabilityCells(
      [
        {
          timestamp: new Date(end.getTime() - HOUR).toISOString(),
          precipitation_probability: null,
          source: "fmi_edited",
        },
      ],
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
        source: "fmi_edited",
      },
    ],
    start,
    start + HOUR,
    start - HOUR,
  );

  assert.equal(cells[0].probability, null);
});

test("probability boxes stop when source changes to ECMWF", () => {
  const start = Date.parse("2026-10-18T10:00:00Z");

  const cells = buildPrecipitationProbabilityCells(
    [
      {
        timestamp: new Date(start).toISOString(),
        precipitation_probability: 30,
        source: "fmi_edited",
      },
      {
        timestamp: new Date(start + 2 * HOUR).toISOString(),
        precipitation_probability: 50,
        source: "fmi_edited",
      },
      {
        timestamp: new Date(start + 3 * HOUR).toISOString(),
        precipitation_probability: null,
        source: "ecmwf",
      },
    ],
    start,
    start + 6 * HOUR,
    start - HOUR,
  );

  assert.deepEqual(
    cells.map((cell) => cell.probability),
    [30, null, 50],
  );

  assert.equal(cells.length, 3);
});

test("ECMWF-only forecasts produce no probability boxes", () => {
  const start = Date.parse("2026-10-18T10:00:00Z");

  const cells = buildPrecipitationProbabilityCells(
    [
      {
        timestamp: new Date(start).toISOString(),
        precipitation_probability: null,
        source: "ecmwf",
      },
    ],
    start,
    start + 6 * HOUR,
    start - HOUR,
  );

  assert.deepEqual(cells, []);
});

test("FMI-only forecasts stop after the final FMI hour", () => {
  const start = Date.parse("2026-10-18T10:00:00Z");

  const cells = buildPrecipitationProbabilityCells(
    [
      {
        timestamp: new Date(start).toISOString(),
        precipitation_probability: 15,
        source: "fmi_edited",
      },
      {
        timestamp: new Date(start + HOUR).toISOString(),
        precipitation_probability: null,
        source: "fmi_edited",
      },
    ],
    start,
    start + 6 * HOUR,
    start - HOUR,
  );

  assert.deepEqual(
    cells.map((cell) => cell.probability),
    [15, null],
  );

  assert.equal(cells.length, 2);
});

test("HARMONIE forecasts support precipitation probability", () => {
  const start = Date.parse("2026-10-18T10:00:00Z");

  const cells = buildPrecipitationProbabilityCells(
    [
      {
        timestamp: new Date(start).toISOString(),
        precipitation_probability: 65,
        source: "harmonie",
      },
      {
        timestamp: new Date(start + HOUR).toISOString(),
        precipitation_probability: null,
        source: "ecmwf",
      },
    ],
    start,
    start + 4 * HOUR,
    start - HOUR,
  );

  assert.deepEqual(
    cells.map((cell) => cell.probability),
    [65],
  );
});


test("missing current-hour PoP before FMI coverage", () => {
  const hour = Date.parse("2026-10-19T18:00:00Z");

  const forecasts = [
    {
      timestamp: new Date(hour).toISOString(),
      precipitation_probability: null,
      source: "ecmwf" as const,
    },
    {
      timestamp: new Date(hour + HOUR).toISOString(),
      precipitation_probability: 0,
      source: "fmi_edited" as const,
    },
    {
      timestamp: new Date(hour + 2 * HOUR).toISOString(),
      precipitation_probability: 20,
      source: "fmi_edited" as const,
    },
  ];

  const referenceMs = hour + 30 * 60_000;

  const cells = buildPrecipitationProbabilityCells(
    forecasts,
    hour,
    hour + 3 * HOUR,
    referenceMs,
  );

  assert.deepEqual(
    getMissingPrecipitationProbabilityRanges(
      forecasts,
      cells,
      referenceMs,
    ),
    [{ startMs: hour, endMs: hour + HOUR }],
  );
});

test("temporary ECMWF gap preserves later FMI probabilities", () => {
  const hour = Date.parse("2026-10-19T17:00:00Z");

  const forecasts = [
    {
      timestamp: new Date(hour).toISOString(),
      precipitation_probability: 10,
      source: "fmi_edited" as const,
    },
    {
      timestamp: new Date(hour + HOUR).toISOString(),
      precipitation_probability: null,
      source: "ecmwf" as const,
    },
    {
      timestamp: new Date(hour + 2 * HOUR).toISOString(),
      precipitation_probability: 20,
      source: "fmi_edited" as const,
    },
    {
      timestamp: new Date(hour + 3 * HOUR).toISOString(),
      precipitation_probability: null,
      source: "fmi_edited" as const,
    },
    {
      timestamp: new Date(hour + 4 * HOUR).toISOString(),
      precipitation_probability: null,
      source: "ecmwf" as const,
    },
  ];

  const referenceMs = hour + 10 * 60_000;

  const cells = buildPrecipitationProbabilityCells(
    forecasts,
    hour,
    hour + 5 * HOUR,
    referenceMs,
  );

  assert.deepEqual(
    cells.map((cell) => cell.probability),
    [10, null, 20, null],
  );

  assert.deepEqual(
    getMissingPrecipitationProbabilityRanges(
      forecasts,
      cells,
      referenceMs,
    ),
    [
      {
        startMs: hour + HOUR,
        endMs: hour + 2 * HOUR,
      },
      {
        startMs: hour + 3 * HOUR,
        endMs: hour + 4 * HOUR,
      },
    ],
  );
});

test("completed hours do not generate missing PoP notices", () => {
  const hour = Date.parse("2026-10-19T18:00:00Z");

  const forecasts = [
    {
      timestamp: new Date(hour).toISOString(),
      precipitation_probability: null,
      source: "fmi_edited" as const,
    },
    {
      timestamp: new Date(hour + HOUR).toISOString(),
      precipitation_probability: 0,
      source: "fmi_edited" as const,
    },
  ];

  const referenceMs = hour + HOUR;

  const cells = buildPrecipitationProbabilityCells(
    forecasts,
    hour,
    hour + 2 * HOUR,
    referenceMs,
  );

  assert.deepEqual(
    getMissingPrecipitationProbabilityRanges(
      forecasts,
      cells,
      referenceMs,
    ),
    [],
  );
});
