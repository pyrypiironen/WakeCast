import type { Locale } from "./i18n";

/** Reject naive timestamps instead of interpreting them in the viewer/server timezone. */
export function parseTimestamp(value: string | Date): Date {
  if (typeof value === "string" && !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new RangeError("Timestamp must include a timezone offset");
  }
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new RangeError("Invalid timestamp");
  return result;
}

function dateFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
}

function dateKey(formatter: Intl.DateTimeFormat, instant: Date): string {
  const parts = formatter.formatToParts(instant);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function localDateKey(value: string | Date, timeZone: string): string {
  return dateKey(dateFormatter(timeZone), parseTimestamp(value));
}

function calendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("Expected YYYY-MM-DD");
  const result = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== value) {
    throw new RangeError("Invalid calendar date");
  }
  return result;
}

export function addCalendarDays(value: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError("Days must be an integer");
  const date = calendarDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Find the first instant in a local date, without assuming a fixed UTC offset. */
function firstInstant(date: string, formatter: Intl.DateTimeFormat): Date {
  const nominal = calendarDate(date).getTime();
  let low = nominal - 48 * 3_600_000;
  let high = nominal + 48 * 3_600_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (dateKey(formatter, new Date(middle)) < date) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}

/** [start, end), in UTC. Helsinki DST days have 23 or 25 hours, not always 24. */
export function localDayRange(date: string, timeZone: string): { start: Date; end: Date } {
  const formatter = dateFormatter(timeZone);
  const start = firstInstant(date, formatter);
  if (dateKey(formatter, start) !== date) throw new RangeError("Local date does not exist in this timezone");
  return { start, end: firstInstant(addCalendarDays(date, 1), formatter) };
}

export function formatLocalDate(value: string | Date, timeZone: string, locale: Locale = "en"): string {
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-GB", { timeZone, dateStyle: "medium" }).format(parseTimestamp(value));
}

/** Offset is included to distinguish the repeated local hour on autumn DST days. */
export function formatLocalTime(value: string | Date, timeZone: string, locale: Locale = "en"): string {
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset",
  }).format(parseTimestamp(value));
}
