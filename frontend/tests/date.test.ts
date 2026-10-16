import { test } from "node:test";
import assert from "node:assert/strict";
import { localDayRange, localDateKey, addCalendarDays, formatLocalTime, formatLocalDate, parseTimestamp } from "../src/lib/date";

for (const [date, hours, start, end] of [
  ["2026-03-29", 23, "2026-03-28T22:00:00.000Z", "2026-03-29T21:00:00.000Z"],
  ["2026-10-25", 25, "2026-10-24T21:00:00.000Z", "2026-10-25T22:00:00.000Z"],
  ["2026-07-01", 24, "2026-06-30T21:00:00.000Z", "2026-07-01T21:00:00.000Z"],
] as const) {
  test(`Helsinki ${date} has ${hours} hours and exact local boundaries`, () => {
    const range = localDayRange(date, "Europe/Helsinki");
    assert.equal(range.start.toISOString(), start);
    assert.equal(range.end.toISOString(), end);
    assert.equal((+range.end - +range.start) / 3_600_000, hours);
    assert.equal(localDateKey(new Date(+range.end - 1), "Europe/Helsinki"), date);
    assert.equal(localDateKey(range.end, "Europe/Helsinki"), addCalendarDays(date, 1));
  });
}

test("calendar arithmetic crosses leap days and years", () => {
  assert.equal(addCalendarDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addCalendarDays("2026-01-01", -1), "2025-12-31");
  assert.throws(() => addCalendarDays("2026-02-30", 1), RangeError);
  assert.throws(() => addCalendarDays("2026-01-01", 0.5), RangeError);
});

test("local dates and offset timestamps do not use host timezone", () => {
  assert.equal(localDateKey("2026-07-01T23:30:00Z", "Europe/Helsinki"), "2026-07-02");
  assert.equal(+parseTimestamp("2026-07-02T02:30:00+03:00"), +parseTimestamp("2026-07-01T23:30:00Z"));
  assert.throws(() => parseTimestamp("2026-07-01T12:00:00"), RangeError);
  assert.throws(() => parseTimestamp("invalidZ"), RangeError);
  assert.throws(() => localDayRange("2026-07-01", "invalid/zone"), RangeError);
  assert.throws(() => localDayRange("2011-12-30", "Pacific/Apia"), RangeError);
});

test("repeated autumn hours are distinguishable and date is localized", () => {
  const first = formatLocalTime("2026-10-25T00:30:00Z", "Europe/Helsinki");
  const second = formatLocalTime("2026-10-25T01:30:00Z", "Europe/Helsinki");
  assert.match(first, /03:30.*GMT\+3/);
  assert.match(second, /03:30.*GMT\+2/);
  assert.equal(formatLocalDate("2026-07-01T23:30:00Z", "Europe/Helsinki", "fi"), "2.7.2026");
});

test("non-integer timezone offsets are supported", () => {
  assert.equal(localDayRange("2026-07-01", "Asia/Kathmandu").start.toISOString(), "2026-06-30T18:15:00.000Z");
});
