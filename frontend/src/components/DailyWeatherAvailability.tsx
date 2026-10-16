import { localDayRange, parseTimestamp } from "@/lib/date";
import type {
  DailyWeatherData,
  WeatherDataResult,
} from "@/lib/daily-weather";
import { translations, type Locale } from "@/lib/i18n";

interface DailyWeatherAvailabilityProps {
  data: DailyWeatherData;
  selectedDate: string;
  timeZone: string;
  locale: Locale;
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
  const isFutureDay = selectedDate > data.today;

  function isWithinDay(timestamp: string): boolean {
    const time = parseTimestamp(timestamp).getTime();
    return time >= startTime && time < endTime;
  }

  function describe<T>(
    result: WeatherDataResult<T>,
    hasData: (payload: T) => boolean,
  ): string {
    if (result.status === "unavailable") return t.unavailable;
    if (result.status === "error") return t.loadError;
    return hasData(result.data) ? t.available : t.noData;
  }

  const forecastStatus = describe(data.forecasts, (payload) =>
    payload.forecasts.some((point) => isWithinDay(point.timestamp)),
  );

  const observationStatus = isFutureDay
    ? t.futureObservations
    : describe(data.observations, (payload) =>
        payload.observations.some(
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
        ),
      );

  let waterStatus = isFutureDay
    ? t.futureObservations
    : describe(data.water, (payload) =>
        payload.observations.some((point) =>
          isWithinDay(point.timestamp),
        ),
      );

  if (!isFutureDay && data.water.status === "ok") {
    const payload = data.water.data;
    const hasDailyReading = payload.observations.some((point) =>
      isWithinDay(point.timestamp),
    );

    const earlierReadings = [
      ...payload.observations,
      ...(payload.preceding_observation
        ? [payload.preceding_observation]
        : []),
    ];

    const hasEarlierReading = earlierReadings.some(
      (point) => parseTimestamp(point.timestamp).getTime() < startTime,
    );

    if (!hasDailyReading && hasEarlierReading) {
      waterStatus = t.earlierWater;
    }
  }

  const rows = [
    { label: t.forecasts, status: forecastStatus },
    { label: t.observations, status: observationStatus },
    { label: t.waterObservations, status: waterStatus },
  ];

  return (
    <dl className="grid gap-3 text-sm" aria-live="polite">
      {rows.map(({ label, status }) => (
        <div key={label}>
          <dt className="font-semibold">{label}</dt>
          <dd>{status}</dd>
        </div>
      ))}
    </dl>
  );
}