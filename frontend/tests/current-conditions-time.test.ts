import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatCurrentConditionsTime,
  formatCurrentConditionsInterval,
} from "../src/lib/current-conditions-time";

const zone = "Europe/Helsinki";

test("times use HH:mm in English and Finnish without GMT suffixes", () => {
  for (const locale of ["en", "fi"] as const) {
    assert.equal(
      formatCurrentConditionsTime(
        "2026-10-24T19:20:00+03:00",
        zone,
        locale,
      ),
      "19:20",
    );
  }
});

test("UTC timestamps are displayed in the park timezone", () => {
  assert.equal(
    formatCurrentConditionsTime(
      "2026-10-24T16:20:00Z",
      zone,
      "en",
    ),
    "19:20",
  );
});

test("repeated autumn hours deliberately use the same compact label", () => {
  for (const locale of ["en", "fi"] as const) {
    assert.equal(
      formatCurrentConditionsTime(
        "2026-10-25T03:10:00+03:00",
        zone,
        locale,
      ),
      "03:10",
    );

    assert.equal(
      formatCurrentConditionsTime(
        "2026-10-25T03:10:00+02:00",
        zone,
        locale,
      ),
      "03:10",
    );
  }
});

test("intervals use compact park-local times", () => {
  assert.equal(
    formatCurrentConditionsInterval(
      {
        start: Date.parse("2026-10-24T19:00:00+03:00"),
        end: Date.parse("2026-10-24T20:00:00+03:00"),
      },
      zone,
      "en",
    ),
    "19:00–20:00",
  );
});

test("spring transition preserves the actual local interval", () => {
  assert.equal(
    formatCurrentConditionsInterval(
      {
        start: Date.parse("2026-03-29T02:00:00+02:00"),
        end: Date.parse("2026-03-29T04:00:00+03:00"),
      },
      zone,
      "en",
    ),
    "02:00–04:00",
  );
});