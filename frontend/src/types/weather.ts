/** JSON timestamps retain their original offset; convert only for display/querying. */
export type Timestamp = string;
export type ForecastSource = "fmi_edited" | "ecmwf" | "harmonie";

export interface WeatherForecast {
  timestamp: Timestamp;
  temperature: number;
  wind_speed: number;
  wind_gust: number;
  wind_direction: number;
  precipitation: number;
  precipitation_probability: number | null;
  cloudiness: number;
  source: ForecastSource;
}

export interface ParkWeatherResponse {
  forecast_location: string;
  forecasts: WeatherForecast[];
  fetched_at: Timestamp;
  coverage_start: Timestamp;
  coverage_end: Timestamp;
}

export interface WeatherObservationHistoryPoint {
  timestamp: Timestamp;
  fetched_at: Timestamp;
  temperature: number | null;
  wind_speed: number | null;
  wind_gust: number | null;
  wind_direction: number | null;
  precipitation: number | null;
  cloudiness: number | null;
  source: string;
  observation_location: string;
  resolution_minutes: number | null;
  is_aggregated: boolean;
}

export interface ParkWeatherObservationHistoryResponse {
  station_name: string;
  source: string;
  source_station_id: number;
  timezone: string;
  observations: WeatherObservationHistoryPoint[];
}

export interface WaterTemperatureHistoryPoint {
  timestamp: Timestamp;
  fetched_at: Timestamp;
  water_temperature: number;
}

export interface WaterTemperatureStation {
  source: string;
  source_station_id: string;
  observation_location: string;
  latitude: number;
  longitude: number;
}

export interface ParkWaterTemperatureResponse extends WaterTemperatureStation, WaterTemperatureHistoryPoint {
  is_stale: boolean;
}

export interface ParkWaterTemperatureHistoryResponse extends WaterTemperatureStation {
  timezone: string;
  observations: WaterTemperatureHistoryPoint[];
  preceding_observation: WaterTemperatureHistoryPoint | null;
}
