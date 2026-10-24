import { localDayRange, parseTimestamp } from "@/lib/date";
import type { DailyWeatherData, WeatherDataResult } from "@/lib/daily-weather";
import { translations, type Locale } from "@/lib/i18n";
import styles from "./DailyWeatherChart.module.css";

interface DailyWeatherAvailabilityProps {
  data: DailyWeatherData;
  selectedDate: string;
  timeZone: string;
  locale: Locale;
}

export const sourceNames: Record<Locale, Record<string, string>> = {
  en: {
    fmi: "FMI",
    fmi_edited: "FMI",
    ecmwf: "ECMWF",
    harmonie: "HARMONIE",
    syke: "SYKE",
    uiras: "UiRaS",
  },
  fi: {
    fmi: "Ilmatieteen laitos",
    fmi_edited: "Ilmatieteen laitos",
    ecmwf: "ECMWF",
    harmonie: "HARMONIE",
    syke: "SYKE",
    uiras: "UiRaS",
  },
};

function uniqueSources(sources: string[], locale: Locale): string {
  return [...new Set(sources.filter(Boolean))]
    .map((source) => sourceNames[locale][source] ?? source)
    .join(", ");
}

export default function DailyWeatherAvailability({
  data,
  selectedDate,
  timeZone,
  locale,
}: DailyWeatherAvailabilityProps) {
  const t = translations[locale].dailyForecast;
  const { start, end } = localDayRange(selectedDate, timeZone);

  const startTime = start.getTime();
  const endTime = end.getTime();

  function isWithinDay(timestamp: string): boolean {
    const time = parseTimestamp(timestamp).getTime();
    return time >= startTime && time < endTime;
  }

  function sourceStatus<T>(
    result: WeatherDataResult<T>,
    getSources: (payload: T) => string[],
  ): string {
    if (result.status === "unavailable") {
      return t.unavailable;
    }

    if (result.status === "error") {
      return t.loadError;
    }

    const sources = uniqueSources(getSources(result.data), locale);
    return sources || t.noData;
  }

  const forecastSource = sourceStatus(data.forecasts, (payload) =>
    payload.forecasts
      .filter((point) => isWithinDay(point.timestamp))
      .map((point) => point.source),
  );

  const observationSource = sourceStatus(data.observations, (payload) =>
    payload.observations
      .filter(
        (point) =>
          isWithinDay(point.timestamp) &&
          [
            point.temperature,
            point.wind_speed,
            point.wind_gust,
            point.wind_direction,
            point.precipitation,
            point.cloudiness,
          ].some((value) => value !== null),
      )
      .map((point) => point.source),
  );

  const waterSource = sourceStatus(data.water, (payload) =>
    payload.observations.some((point) => isWithinDay(point.timestamp))
      ? [payload.source]
      : [],
  );

  return (
    <p className={styles.sourceInformation} aria-live="polite">
      {t.forecasts}: {forecastSource}
      {" — "}
      {t.observations}: {observationSource}
      {" — "}
      {t.waterObservations}: {waterSource}
    </p>
  );
}
