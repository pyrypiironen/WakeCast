import { localDayRange, parseTimestamp } from "./date";

export type ChartWindow = "12h" | "24h";

const HOUR_MS = 3_600_000;

function localHour(
  instant: Date,
  timeZone: string,
): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  });

  const hour = formatter
    .formatToParts(instant)
    .find((part) => part.type === "hour");

  if (!hour) {
    throw new RangeError("Could not determine local hour");
  }

  return Number(hour.value);
}

export function defaultChartWindow(
  requestedAt: string,
  timeZone: string,
): ChartWindow {
  const hour = localHour(
    parseTimestamp(requestedAt),
    timeZone,
  );

  return hour >= 9 && hour < 21 ? "12h" : "24h";
}

export function getChartWindowRange(
  selectedDate: string,
  timeZone: string,
  window: ChartWindow,
): { start: Date; end: Date } {
  const day = localDayRange(selectedDate, timeZone);

  if (window === "24h") {
    return day;
  }

  let start: Date | null = null;
  let end: Date | null = null;

  for (
    let time = day.start.getTime();
    time < day.end.getTime();
    time += HOUR_MS
  ) {
    const instant = new Date(time);
    const hour = localHour(instant, timeZone);

    if (hour === 9 && start === null) {
      start = instant;
    }

    if (hour === 21 && end === null) {
      end = instant;
    }
  }

  if (!start || !end) {
    throw new RangeError(
      "Could not determine the 09:00–21:00 window",
    );
  }

  return { start, end };
}