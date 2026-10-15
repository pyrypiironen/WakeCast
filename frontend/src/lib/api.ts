import type { Park } from "@/types/park";
import type {
  ParkWeatherResponse,
  ParkWeatherObservationHistoryResponse,
  ParkWaterTemperatureResponse,
  ParkWaterTemperatureHistoryResponse,
} from "@/types/weather";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly detail: unknown) {
    super(`WakeCast API request failed: ${status}`);
    this.name = "ApiError";
  }
}

async function apiGet<T>(path: string): Promise<T> {
  // Public data is fetched by Server Components, never by provider APIs in the browser.
  if (typeof window !== "undefined") throw new Error("WakeCast API client is server-only");
  const API_BASE_URL = process.env.WAKECAST_API_URL;
  if (!API_BASE_URL) {
    throw new Error("WAKECAST_API_URL is not configured");
  }

  const response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const detail = body && typeof body === "object" && "detail" in body ? body.detail : null;
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as T;
}

export function getParkWeather(slug: string): Promise<ParkWeatherResponse> {
  return apiGet(`/api/parks/${encodeURIComponent(slug)}/weather`);
}

export function getParkWaterTemperature(slug: string): Promise<ParkWaterTemperatureResponse> {
  return apiGet(`/api/parks/${encodeURIComponent(slug)}/water-temperature`);
}

/** UTC elapsed duration matches the backend's 31-day, half-open range constraint. */
function historyQuery(start: Date, end: Date): string {
  const duration = end.getTime() - start.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 31 * 86_400_000) {
    throw new RangeError("History range must be positive and at most 31 days");
  }
  return new URLSearchParams({ start_time: start.toISOString(), end_time: end.toISOString() }).toString();
}

export function getParkWeatherObservations(slug: string, start: Date, end: Date): Promise<ParkWeatherObservationHistoryResponse> {
  return apiGet(`/api/parks/${encodeURIComponent(slug)}/weather/observations?${historyQuery(start, end)}`);
}

export function getParkWaterTemperatureHistory(slug: string, start: Date, end: Date): Promise<ParkWaterTemperatureHistoryResponse> {
  return apiGet(`/api/parks/${encodeURIComponent(slug)}/water-temperature/history?${historyQuery(start, end)}`);
}

export async function getParks(): Promise<Park[]> {
  return apiGet<Park[]>("/api/parks");
}

export async function getPark(slug: string): Promise<Park> {
  return apiGet<Park>(
    `/api/parks/${encodeURIComponent(slug)}`
  );
}
