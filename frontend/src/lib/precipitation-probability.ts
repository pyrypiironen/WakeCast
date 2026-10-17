import type { WeatherForecast } from "@/types/weather";

const HOUR_MS = 3_600_000;

type ProbabilityForecast = Pick<
  WeatherForecast,
  "timestamp" | "precipitation_probability"
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
  const probabilities = new Map<number, number | null>();

  for (const forecast of forecasts) {
    const time = Date.parse(forecast.timestamp);

    if (
      !Number.isFinite(time) ||
      time < startMs ||
      time >= endMs ||
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

  for (let time = startMs; time < endMs; time += HOUR_MS) {
    cells.push({
      time,
      isPast: time + HOUR_MS <= referenceMs,
      probability: probabilities.get(time) ?? null,
    });
  }

  return cells;
}