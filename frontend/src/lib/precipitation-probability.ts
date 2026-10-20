
import type { WeatherForecast } from "@/types/weather";

const HOUR_MS = 3_600_000;

type ProbabilityForecast = Pick<
  WeatherForecast,
  "timestamp" | "precipitation_probability" | "source"
>;

export interface ProbabilityCell {
  time: number;
  probability: number | null;
  isPast: boolean;
}

export interface MissingProbabilityRange {
  startMs: number;
  endMs: number;
}

function getFmiTimes(
  forecasts: readonly ProbabilityForecast[],
): number[] {
  return forecasts
    .filter(
      (forecast) =>
        forecast.source === "fmi_edited" ||
        forecast.source === "harmonie",
    )
    .map((forecast) => Date.parse(forecast.timestamp))
    .filter((time) => Number.isFinite(time));
}

export function buildPrecipitationProbabilityCells(
  forecasts: readonly ProbabilityForecast[],
  startMs: number,
  endMs: number,
  referenceMs: number,
): ProbabilityCell[] {
  const fmiTimes = getFmiTimes(forecasts);

  // No FMI forecasts means no precipitation-probability row.
  if (fmiTimes.length === 0) return [];

  // Keep the row through the last FMI hour.
  // A temporary ECMWF gap must not hide later FMI values.
  // Do not extend into normal ECMWF-only coverage.
  const probabilityEndMs = Math.min(
    endMs,
    Math.max(...fmiTimes) + HOUR_MS,
  );

  const probabilities = new Map<number, number | null>();

  for (const forecast of forecasts) {
    if (
      forecast.source !== "fmi_edited" &&
      forecast.source !== "harmonie"
    ) {
      continue;
    }

    const time = Date.parse(forecast.timestamp);

    if (
      !Number.isFinite(time) ||
      time < startMs ||
      time >= probabilityEndMs ||
      time + HOUR_MS <= referenceMs
    ) {
      continue;
    }

    const value = forecast.precipitation_probability;

    probabilities.set(
      time,
      typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 100
        ? value
        : null,
    );
  }

  const cells: ProbabilityCell[] = [];

  for (
    let time = startMs;
    time < probabilityEndMs;
    time += HOUR_MS
  ) {
    cells.push({
      time,
      isPast: time + HOUR_MS <= referenceMs,
      probability: probabilities.get(time) ?? null,
    });
  }

  return cells;
}

export function getMissingPrecipitationProbabilityRanges(
  forecasts: readonly ProbabilityForecast[],
  cells: readonly ProbabilityCell[],
  referenceMs: number,
): MissingProbabilityRange[] {
  if (!Number.isFinite(referenceMs)) return [];

  const fmiTimes = getFmiTimes(forecasts);

  if (fmiTimes.length === 0) return [];

  const firstFmiTime = Math.min(...fmiTimes);
  const lastFmiTime = Math.max(...fmiTimes);

  const currentHour =
    Math.floor(referenceMs / HOUR_MS) * HOUR_MS;

  // FMI sometimes omits the current hour while providing
  // forecasts starting from the next hour.
  const missingCurrentHourBeforeFmi =
    firstFmiTime === currentHour + HOUR_MS;

  const ranges: MissingProbabilityRange[] = [];

  for (const cell of cells) {
    // No warnings for completed hours or valid PoP,
    // including a genuine 0% probability.
    if (cell.isPast || cell.probability !== null) {
      continue;
    }

    // Missing PoP within FMI forecast coverage.
    const withinFmiCoverage =
      cell.time >= firstFmiTime &&
      cell.time <= lastFmiTime;

    // Also detect the current hour immediately before
    // FMI coverage begins.
    const missingLeadingHour =
      missingCurrentHourBeforeFmi &&
      cell.time === currentHour;

    // Do not warn about normal ECMWF-only forecast hours
    // after FMI coverage ends.
    if (!withinFmiCoverage && !missingLeadingHour) {
      continue;
    }

    const previous = ranges.at(-1);

    // Combine consecutive missing hours into one interval.
    if (previous && previous.endMs === cell.time) {
      previous.endMs = cell.time + HOUR_MS;
    } else {
      ranges.push({
        startMs: cell.time,
        endMs: cell.time + HOUR_MS,
      });
    }
  }

  return ranges;
}
