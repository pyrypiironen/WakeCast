import type { ParkWeatherObservationHistoryResponse } from "../types/weather";

type WeatherStationIdentity = Pick<
  ParkWeatherObservationHistoryResponse,
  "source" | "source_station_id" | "station_name"
>;

const weatherStationNames: Readonly<Record<string, string>> = {
  "fmi:100971": "Kaisaniemi",
};

/**
 * Compact UI name for explicitly mapped stations.
 * Unknown stations retain their full API name.
 */
export function weatherStationDisplayName(
  station: WeatherStationIdentity,
): string {
  const provider = station.source.trim().toLowerCase();
  const key = `${provider}:${station.source_station_id}`;

  return weatherStationNames[key] ?? station.station_name.trim();
}