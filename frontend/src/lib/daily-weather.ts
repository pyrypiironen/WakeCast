import {
  ApiError,
  getParkWaterTemperatureHistory,
  getParkWeather,
  getParkWeatherObservations,
} from "./api";
import {
  addCalendarDays,
  localDateKey,
  localDayRange,
  parseTimestamp,
} from "./date";
import type {
  ParkWaterTemperatureHistoryResponse,
  ParkWeatherObservationHistoryResponse,
  ParkWeatherResponse,
} from "../types/weather";

export type WeatherDataResult<T> =
  | {
      status: "ok";
      data: T;
    }
  | {
      status: "unavailable";
      httpStatus: 404 | 503;
    }
  | {
      status: "error";
      httpStatus: number | null;
    };

export interface DailyWeatherData {
  today: string;
  earliestDate: string;
  latestDate: string;
  requestedAt: string;
  forecasts: WeatherDataResult<ParkWeatherResponse>;
  observations: WeatherDataResult<ParkWeatherObservationHistoryResponse>;
  water: WeatherDataResult<ParkWaterTemperatureHistoryResponse>;
}

async function readSource<T>(
  request: () => Promise<T>,
): Promise<WeatherDataResult<T>> {
  try {
    return {
      status: "ok",
      data: await request(),
    };
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 503)
    ) {
      return {
        status: "unavailable",
        httpStatus: error.status,
      };
    }

    return {
      status: "error",
      httpStatus: error instanceof ApiError ? error.status : null,
    };
  }
}

/**
 * Server-side loading for the daily graph.
 * Preserve source payloads, null measurements and station metadata.
 * A successful empty history remains distinct from a failed request.
 */
export async function loadDailyWeather(
  slug: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<DailyWeatherData> {
  const instant = parseTimestamp(now);
  const today = localDateKey(instant, timeZone);
  const earliestDate = addCalendarDays(today, -3);
  const latestDate = addCalendarDays(today, 10);
  const { start } = localDayRange(earliestDate, timeZone);

  const [forecasts, observations, water] = await Promise.all([
    readSource(() => getParkWeather(slug)),
    readSource(() => getParkWeatherObservations(slug, start, instant)),
    readSource(() => getParkWaterTemperatureHistory(slug, start, instant)),
  ]);

  return {
    today,
    earliestDate,
    latestDate,
    requestedAt: instant.toISOString(),
    forecasts,
    observations,
    water,
  };
}