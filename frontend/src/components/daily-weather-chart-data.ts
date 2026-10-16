import {
  buildLineSeries,
  createChartScale,
  measuredForecastBridge,
} from "@/lib/chart-lines";
import { selectDailyAirWeather } from "@/lib/daily-series";
import { selectDailyWater } from "@/lib/daily-water";
import { getChartWindowRange, type ChartWindow } from "@/lib/chart-window";
import type { DailyWeatherData } from "@/lib/daily-weather";
import { translations, type Locale } from "@/lib/i18n";

export interface DailyWeatherChartProps {
  data: DailyWeatherData;
  selectedDate: string;
  timeZone: string;
  locale: Locale;
  chartWindow: ChartWindow;
}

export interface ChartGeometry {
  clipId: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  x: (time: number) => number;
  y: (value: number, axis: "wind" | "temperature") => number;
  cloudY: (value: number) => number;
}

const HOUR_MS = 3_600_000;

export function prepareDailyWeatherChart({
  data,
  selectedDate,
  timeZone,
  locale,
  chartWindow,
}: DailyWeatherChartProps) {
  const t = translations[locale].dailyForecast;
  const daily = selectDailyAirWeather(data, selectedDate, timeZone);

  const observations =
    daily.observations.status === "ok"
      ? daily.observations.data.observations
      : [];
  const forecasts =
    daily.forecasts.status === "ok" ? daily.forecasts.data.forecasts : [];

  // Select actual water-temperature measurements for the day.
  const dailyWater = selectDailyWater(data, selectedDate, timeZone);

  const waterHistory =
    dailyWater.water.status === "ok" ? dailyWater.water.data : null;

  const waterReadings = waterHistory?.observations ?? [];

  // A preceding reading may establish the held temperature
  // at the beginning of a day containing new measurements.
  // Never draw a line beyond the day's last actual reading.
  const waterPoints =
    waterReadings.length === 0
      ? []
      : [
          ...(waterHistory?.preceding_observation
            ? [
                {
                  time: Date.parse(dailyWater.start),
                  value: waterHistory.preceding_observation.water_temperature,
                },
              ]
            : []),

          ...waterReadings.map((point) => ({
            time: Date.parse(point.timestamp),
            value: point.water_temperature,
          })),
        ];

  const visibleRange = getChartWindowRange(selectedDate, timeZone, chartWindow);

  const startMs = visibleRange.start.getTime();
  const endMs = visibleRange.end.getTime();
  const durationMs = endMs - startMs;

  // CloudSeries calculation
  const cloudSeries = [
    ...buildLineSeries(
      observations.map((point) => ({
        timestamp: point.timestamp,
        value: point.cloudiness,
        source: point.source,
        intervalMinutes: point.resolution_minutes,
      })),
    ).segments,

    ...buildLineSeries(
      forecasts.map((point) => ({
        timestamp: point.timestamp,
        value: point.cloudiness,
        source: point.source,
        intervalMinutes: 60,
      })),
      { connectSourceChanges: true },
    ).segments,
  ];

  // New cloudBridge code
  const lastCloudObservation = observations.at(-1);
  const firstCloudForecast = forecasts[0];

  const cloudBridge = measuredForecastBridge(
    lastCloudObservation
      ? {
          timestamp: lastCloudObservation.timestamp,
          value: lastCloudObservation.cloudiness,
          source: lastCloudObservation.source,
          intervalMinutes: lastCloudObservation.resolution_minutes,
        }
      : undefined,
    firstCloudForecast
      ? {
          timestamp: firstCloudForecast.timestamp,
          value: firstCloudForecast.cloudiness,
          source: firstCloudForecast.source,
          intervalMinutes: 60,
        }
      : undefined,
    2 * HOUR_MS,
  );

  // Existing weather-series definitions
  const definitions = [
    { field: "wind_speed", label: t.wind, color: "#298A63", axis: "wind" },
    { field: "wind_gust", label: t.gust, color: "#73AD7E", axis: "wind" },
    {
      field: "temperature",
      label: t.air,
      color: "#E58A35",
      axis: "temperature",
    },
  ] as const;

  const series = definitions.flatMap((definition) => [
    {
      ...definition,
      kind: "measured" as const,
      ...buildLineSeries(
        observations.map((point) => ({
          timestamp: point.timestamp,
          value: point[definition.field],
          source: point.source,
          intervalMinutes: point.resolution_minutes,
        })),
      ),
    },
    {
      ...definition,
      kind: "forecast" as const,
      ...buildLineSeries(
        forecasts.map((point) => ({
          timestamp: point.timestamp,
          value: point[definition.field],
          source: point.source,
          intervalMinutes: 60,
        })),
        { connectSourceChanges: true },
      ),
    },
  ]);

  const transitionLines = definitions.flatMap((definition) => {
    const lastObserved = observations.at(-1);
    const firstForecast = forecasts[0];

    const points = measuredForecastBridge(
      lastObserved
        ? {
            timestamp: lastObserved.timestamp,
            value: lastObserved[definition.field],
            source: lastObserved.source,
            intervalMinutes: lastObserved.resolution_minutes,
          }
        : undefined,
      firstForecast
        ? {
            timestamp: firstForecast.timestamp,
            value: firstForecast[definition.field],
            source: firstForecast.source,
            intervalMinutes: 60,
          }
        : undefined,
      2 * HOUR_MS,
    );

    return points ? [{ ...definition, points }] : [];
  });

  const windScale = createChartScale(
    series
      .filter((item) => item.axis === "wind")
      .flatMap((item) =>
        item.segments.flatMap((segment) => segment.map((point) => point.value)),
      ),
    0,
    20,
  );

  const temperatureScale = createChartScale(
    [
      ...series
        .filter((item) => item.axis === "temperature")
        .flatMap((item) =>
          item.segments.flatMap((segment) =>
            segment.map((point) => point.value),
          ),
        ),
      ...waterPoints.map((point) => point.value),
    ],
    0,
    40,
  );

  // Unique source changes within the visible chart window.
  const sourceChanges = Array.from(
    new Map(
      series
        .flatMap((item) => item.breaks)
        .filter(
          (gap) =>
            gap.reasons.includes("source-change") &&
            gap.to !== null &&
            gap.to >= startMs &&
            gap.to <= endMs &&
            gap.fromSource !== null &&
            gap.toSource !== null &&
            gap.fromSource !== gap.toSource,
        )
        .map(
          (gap) =>
            [`${gap.to}|${gap.fromSource}|${gap.toSource}`, gap] as const,
        ),
    ).values(),
  ).sort((a, b) => (a.to ?? 0) - (b.to ?? 0));

  return {
    daily,
    waterHistory,
    waterReadings,
    waterPoints,
    startMs,
    endMs,
    durationMs,
    cloudSeries,
    cloudBridge,
    series,
    transitionLines,
    windScale,
    temperatureScale,
    sourceChanges,
  };
}

export type PreparedDailyWeatherChart = ReturnType<
  typeof prepareDailyWeatherChart
>;

export interface ChartLayerProps {
  chart: PreparedDailyWeatherChart;
  geometry: ChartGeometry;
}
