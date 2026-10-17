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

export function buildPrecipitationProbabilityCells(
  forecasts: readonly ProbabilityForecast[],
  startMs: number,
  endMs: number,
  referenceMs: number,
): ProbabilityCell[] {
  const fmiTimes: number[] = [];
  const ecmwfTimes: number[] = [];

  for (const forecast of forecasts) {
    const time = Date.parse(forecast.timestamp);

    if (!Number.isFinite(time)) continue;

    if (forecast.source === "ecmwf") {
      ecmwfTimes.push(time);
    } else if (
      forecast.source === "fmi_edited" ||
      forecast.source === "harmonie"
    ) {
      fmiTimes.push(time);
    }
  }

  // No FMI forecast means no precipitation-probability row.
  if (fmiTimes.length === 0) return [];

  // Ignore ECMWF hours before FMI coverage begins.
  // Stop when the forecast switches from FMI to ECMWF.
  const firstFmiTime = Math.min(...fmiTimes);
  const laterEcmwfTimes = ecmwfTimes.filter(
    (time) => time > firstFmiTime,
  );

  const probabilityEndMs = Math.min(
    endMs,
    laterEcmwfTimes.length > 0
      ? Math.min(...laterEcmwfTimes)
      : Math.max(...fmiTimes) + HOUR_MS,
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

  for (let time = startMs; time < probabilityEndMs; time += HOUR_MS) {
    cells.push({
      time,
      isPast: time + HOUR_MS <= referenceMs,
      probability: probabilities.get(time) ?? null,
    });
  }

  return cells;
}