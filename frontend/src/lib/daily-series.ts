import { localDayRange, parseTimestamp } from "./date";
import type {
  DailyWeatherData,
  WeatherDataResult,
} from "./daily-weather";

type DailyAirWeatherInput = Pick<
  DailyWeatherData,
  "requestedAt" | "forecasts" | "observations"
>;

function mapAvailable<T>(
  result: WeatherDataResult<T>,
  transform: (data: T) => T,
): WeatherDataResult<T> {
  if (result.status !== "ok") return result;

  return {
    status: "ok",
    data: transform(result.data),
  };
}

/**
 * Select actual samples for one park-local calendar day.
 *
 * Observations and forecasts remain separate.
 * No interpolation, hourly rounding or missing-value replacement.
 */
export function selectDailyAirWeather(
  input: DailyAirWeatherInput,
  selectedDate: string,
  timeZone: string,
) {
  const { start, end } = localDayRange(selectedDate, timeZone);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const referenceMs = parseTimestamp(input.requestedAt).getTime();

  // Include the following midnight only as the chart's closing point.
function withinDay(timestamp: string): boolean {
  const time = parseTimestamp(timestamp).getTime();
  return time >= startMs && time <= endMs;
}

  function byTimestamp(
    a: { timestamp: string },
    b: { timestamp: string },
  ): number {
    return (
      parseTimestamp(a.timestamp).getTime() -
      parseTimestamp(b.timestamp).getTime()
    );
  }

  const observations = mapAvailable(input.observations, (payload) => ({
    ...payload,
    observations: payload.observations
      .filter(
        (point) =>
          withinDay(point.timestamp) &&
          parseTimestamp(point.timestamp).getTime() <= referenceMs,
      )
      .sort(byTimestamp),
  }));

    // Include the following midnight as a closing graph point.
    // Observation selection remains [start, end).
  const forecasts = mapAvailable(input.forecasts, (payload) => ({
    ...payload,
    forecasts: payload.forecasts
      .filter((point) => {
        const time = parseTimestamp(point.timestamp).getTime();

        return (
          time >= startMs &&
          time <= endMs &&
          time >= referenceMs
        );
      })
      .sort(byTimestamp),
  }));

  return {
    selectedDate,
    start: start.toISOString(),
    end: end.toISOString(),
    referenceTime: input.requestedAt,
    durationHours: (endMs - startMs) / 3_600_000,
    observations,
    forecasts,
  };
}