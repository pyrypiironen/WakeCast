"use server";

import { loadDailyWeather } from "@/lib/daily-weather";

export async function refreshDailyWeather(
  slug: string,
  timeZone: string,
) {
  return loadDailyWeather(slug, timeZone);
}