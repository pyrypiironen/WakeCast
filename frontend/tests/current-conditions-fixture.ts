import type { DailyWeatherData } from "../src/lib/daily-weather";
import type { WeatherForecast, WeatherObservationHistoryPoint } from "../src/types/weather";

export const requestedAt = "2026-10-19T19:20:00+03:00";
export function observation(timestamp: string, overrides: Partial<WeatherObservationHistoryPoint> = {}): WeatherObservationHistoryPoint {
  return { timestamp, fetched_at: requestedAt, temperature: 8.4, wind_speed: 3.2,
    wind_gust: 5.6, wind_direction: 180, precipitation: 0.4, cloudiness: 75,
    source: "fmi", observation_location: "Helsinki Kaisaniemi", resolution_minutes: 10,
    is_aggregated: false, ...overrides };
}
export function forecast(timestamp: string, overrides: Partial<WeatherForecast> = {}): WeatherForecast {
  return { timestamp, temperature: 9, wind_speed: 4, wind_gust: 6, wind_direction: 180,
    precipitation: 0, precipitation_probability: 20, cloudiness: 80, source: "fmi_edited", ...overrides };
}
export function fixture() {
  return {
    today: "2026-10-19", earliestDate: "2026-10-16", latestDate: "2026-10-29", requestedAt,
    observations: { status: "ok", data: { station_name: "Helsinki Kaisaniemi", source: "fmi", source_station_id: 100971,
      timezone: "Europe/Helsinki", observations: [observation("2026-10-19T19:00:00+03:00")] } },
    forecasts: { status: "ok", data: { forecast_location: "Karhusaari", fetched_at: "2026-10-19T19:07:00+03:00",
      coverage_start: "2026-10-19T19:00:00+03:00", coverage_end: "2026-10-19T20:00:00+03:00",
      forecasts: [forecast("2026-10-19T19:00:00+03:00"), forecast("2026-10-19T20:00:00+03:00", { precipitation_probability: 40 })] } },
    water: { status: "ok", data: { source: "uiras", source_station_id: "70B3D57050004CDB", observation_location: "Lauttasaaren mattolaituri",
      latitude: 60.1707, longitude: 24.8579, timezone: "Europe/Helsinki", preceding_observation: null,
      observations: [{ timestamp: "2026-10-19T18:32:00+03:00", fetched_at: "2026-10-19T19:07:00+03:00", water_temperature: 9.8 }] } },
  } satisfies DailyWeatherData;
}
