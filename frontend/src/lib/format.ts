import type { Locale } from "./i18n";

export const MISSING_VALUE = "—";

function measurement(value: number | null | undefined, unit: string, locale: Locale, digits: number): string {
  if (value == null || !Number.isFinite(value)) return MISSING_VALUE;
  return `${new Intl.NumberFormat(locale === "fi" ? "fi-FI" : "en-GB", {
    maximumFractionDigits: digits,
  }).format(value)} ${unit}`;
}

export const formatTemperature = (value: number | null | undefined, locale: Locale = "en") => measurement(value, "°C", locale, 1);
export const formatWindSpeed = (value: number | null | undefined, locale: Locale = "en") => measurement(value, "m/s", locale, 1);
export const formatPrecipitation = (value: number | null | undefined, locale: Locale = "en") => measurement(value, "mm", locale, 1);
export const formatPercentage = (value: number | null | undefined, locale: Locale = "en") => measurement(value, "%", locale, 0);

const compass = {
  en: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
  fi: ["P", "Ko", "I", "Ka", "E", "Lo", "L", "Lu"],
} as const;

/** Meteorological FROM direction. This does not calculate a movement-arrow angle. */
export function formatWindDirection(degrees: number | null | undefined, locale: Locale = "en"): string {
  if (degrees == null || !Number.isFinite(degrees)) return MISSING_VALUE;
  const bearing = ((degrees % 360) + 360) % 360;
  return compass[locale][Math.round(bearing / 45) % 8];
}

/** Caller must use actual provenance; timestamps alone cannot determine this label. */
export function formatProvenance(kind: "measured" | "forecast", locale: Locale = "en"): string {
  return { en: { measured: "Measured", forecast: "Forecast" }, fi: { measured: "Mitattu", forecast: "Ennuste" } }[locale][kind];
}
