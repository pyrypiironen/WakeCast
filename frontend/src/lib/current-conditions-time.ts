import type { Locale } from "./i18n";

type TimeInput = Date | string | number;

export function formatCurrentConditionsTime(
  value: TimeInput,
  timeZone: string,
  locale: Locale,
): string {
  const instant = new Date(
    value instanceof Date ? value.getTime() : value,
  );

  const parts = new Intl.DateTimeFormat(
    locale === "fi" ? "fi-FI" : "en-GB",
    {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
  ).formatToParts(instant);

  const hour = parts.find((part) => part.type === "hour")!.value;
  const minute = parts.find((part) => part.type === "minute")!.value;

  return `${hour}:${minute}`;
}

export function formatCurrentConditionsInterval(
  interval: { start: number; end: number },
  timeZone: string,
  locale: Locale,
): string {
  return [
    formatCurrentConditionsTime(interval.start, timeZone, locale),
    formatCurrentConditionsTime(interval.end, timeZone, locale),
  ].join("–");
}