import type { Park } from "@/types/park";

const API_BASE_URL = process.env.WAKECAST_API_URL;

async function apiGet<T>(path: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("WAKECAST_API_URL is not configured");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `WakeCast API request failed: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as T;
}

export async function getParks(): Promise<Park[]> {
  return apiGet<Park[]>("/api/parks");
}

export async function getPark(slug: string): Promise<Park> {
  return apiGet<Park>(
    `/api/parks/${encodeURIComponent(slug)}`
  );
}
