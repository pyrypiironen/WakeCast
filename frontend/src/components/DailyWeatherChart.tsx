"use client";

import { useId } from "react";

import {
  buildLineSeries,
  createChartScale,
  measuredForecastBridge,
} from "@/lib/chart-lines";
import { selectDailyAirWeather } from "@/lib/daily-series";
import type { DailyWeatherData } from "@/lib/daily-weather";
import {
  formatLocalDate,
  formatLocalTime,
} from "@/lib/date";
import { translations, type Locale } from "@/lib/i18n";
import styles from "./DailyWeatherChart.module.css";
import {
  getChartWindowRange,
  type ChartWindow,
} from "@/lib/chart-window";
import DailyWeatherAvailability, {
  sourceNames,
} from "./DailyWeatherAvailability";

interface DailyWeatherChartProps {
  data: DailyWeatherData;
  selectedDate: string;
  timeZone: string;
  locale: Locale;
  chartWindow: ChartWindow;
}

const WIDTH = 960;
const HEIGHT = 320;
const LEFT = 52;
const RIGHT = 848;
const CLOUD_AXIS_X = RIGHT + 72;
const TOP = 40;
const BOTTOM = 270;
const HOUR_MS = 3_600_000;

export default function DailyWeatherChart({
  data,
  selectedDate,
  timeZone,
  locale,
  chartWindow,
}: DailyWeatherChartProps) {
  const clipId = useId();
  const t = translations[locale].dailyForecast;
  const daily = selectDailyAirWeather(data, selectedDate, timeZone);

  const observations = daily.observations.status === "ok"
    ? daily.observations.data.observations
    : [];
  const forecasts = daily.forecasts.status === "ok"
    ? daily.forecasts.data.forecasts
    : [];

  const visibleRange = getChartWindowRange(
    selectedDate,
    timeZone,
    chartWindow,
  );

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
  { field: "temperature", label: t.air, color: "#E58A35", axis: "temperature" },
] as const;

  const series = definitions.flatMap((definition) => [
    {
      ...definition,
      kind: "measured" as const,
      ...buildLineSeries(observations.map((point) => ({
        timestamp: point.timestamp,
        value: point[definition.field],
        source: point.source,
        intervalMinutes: point.resolution_minutes,
      }))),
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
      .flatMap((item) => item.segments.flatMap(
        (segment) => segment.map((point) => point.value),
      )),
    0,
    20,
  );

  const temperatureScale = createChartScale(
    series
      .filter((item) => item.axis === "temperature")
      .flatMap((item) => item.segments.flatMap(
        (segment) => segment.map((point) => point.value),
      )),
    0,
    40,
  );

  function x(time: number): number {
    return LEFT + ((time - startMs) / durationMs) * (RIGHT - LEFT);
  }

  function y(value: number, axis: "wind" | "temperature"): number {
    const scale = axis === "wind" ? windScale : temperatureScale;
    return BOTTOM -
      ((value - scale.min) / (scale.max - scale.min)) * (BOTTOM - TOP);
  }

  function cloudY(value: number): number {
  const percentage = Math.max(0, Math.min(100, value));
  return BOTTOM - (BOTTOM - TOP) * (percentage / 100);
}

  const clock = new Intl.DateTimeFormat(
    locale === "fi" ? "fi-FI" : "en-GB",
    {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
  );

// Vertical gridlines at every hour.
const hourTicks: number[] = [];

for (let time = startMs; time <= endMs; time += HOUR_MS) {
  hourTicks.push(time);
}

// Visible time labels every 3 hours.
const timeTicks: number[] = [];

for (let time = startMs; time < endMs; time += 3 * HOUR_MS) {
  if (endMs - time >= 1.5 * HOUR_MS) {
    timeTicks.push(time);
  }
}

timeTicks.push(endMs);
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
      .map((gap) => [
        `${gap.to}|${gap.fromSource}|${gap.toSource}`,
        gap,
      ] as const),
  ).values(),
).sort((a, b) => (a.to ?? 0) - (b.to ?? 0));

  return (
    <figure className={styles.figure}>
      <div
        className={styles.scroll}
        role="region"
        aria-label={t.chartRegion}
        tabIndex={0}
      >
        <svg
          className={styles.chart}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${translations[locale].parkPage.daily}: ${formatLocalDate(
            daily.start,
            timeZone,
            locale,
          )}`}
        >
          <desc>{t.chartDescription}</desc>

          <defs>
  <clipPath id={clipId}>
    <rect
      x={LEFT}
      y={TOP}
      width={RIGHT - LEFT}
      height={BOTTOM - TOP}
    />
  </clipPath>

  <pattern
  id={`${clipId}-missing-cloud`}
  width={8}
  height={8}
  patternUnits="userSpaceOnUse"
>
  <rect width={8} height={8} fill="#ffffff" />
</pattern>
</defs>

          {/* Background inside the plotting area only */}
<rect
  x={LEFT}
  y={TOP}
  width={RIGHT - LEFT}
  height={BOTTOM - TOP}
  className={styles.plotBackground}
/>

{/* Missing cloudiness data: white with diagonal stripes */}
<g clipPath={`url(#${clipId})`}>
  <rect
    x={LEFT}
    y={TOP}
    width={RIGHT - LEFT}
    height={BOTTOM - TOP}
    fill={`url(#${clipId}-missing-cloud)`}
  />

  {/* Restore blue sky wherever valid cloudiness data exists */}
  {cloudSeries.map((segment, index) => {
    if (segment.length < 2) return null;

    const first = segment[0];
    const last = segment[segment.length - 1];

    return (
      <rect
        key={`cloud-data-${index}`}
        x={x(first.time)}
        y={TOP}
        width={x(last.time) - x(first.time)}
        height={BOTTOM - TOP}
        className={styles.plotBackground}
      />
    );
  })}

  {/* Measurement-to-forecast transition */}
  {cloudBridge && (
    <rect
      x={x(cloudBridge[0].time)}
      y={TOP}
      width={x(cloudBridge[1].time) - x(cloudBridge[0].time)}
      height={BOTTOM - TOP}
      className={styles.plotBackground}
    />
  )}
</g>

{/* Continuous cloudiness shading */}
<g clipPath={`url(#${clipId})`}>
  {cloudSeries.map((segment, index) => {
    if (segment.length < 2) return null;

    const first = segment[0];
    const last = segment[segment.length - 1];

    const points = [
      `${x(first.time)},${BOTTOM}`,
      ...segment.map(
        (point) => `${x(point.time)},${cloudY(point.value)}`,
      ),
      `${x(last.time)},${BOTTOM}`,
    ].join(" ");

    return (
      <polygon
        key={`cloud-segment-${index}`}
        points={points}
        className={styles.cloudShading}
      />
    );
  })}

  {cloudBridge && (
    <polygon
      points={[
        `${x(cloudBridge[0].time)},${BOTTOM}`,
        ...cloudBridge.map(
          (point) => `${x(point.time)},${cloudY(point.value)}`,
        ),
        `${x(cloudBridge[1].time)},${BOTTOM}`,
      ].join(" ")}
      className={styles.cloudShading}
    />
  )}
</g>

<text
  x={LEFT - 12}
  y={17}
  textAnchor="end"
  className={styles.unit}
>
  °C
</text>

<text
  x={RIGHT + 12}
  y={17}
  textAnchor="start"
  className={styles.unit}
>
  m/s
</text>

{/* Vertical gridlines every hour */}
{hourTicks.map((time) => (
  <line
    key={`hour-${time}`}
    x1={x(time)}
    x2={x(time)}
    y1={TOP}
    y2={BOTTOM}
    className={styles.grid}
  />
))}

{/* Time labels every 3 hours */}
{timeTicks.map((time) => (
  <g key={`time-${time}`}>
    <title>
      {`${formatLocalDate(new Date(time), timeZone, locale)} · ${formatLocalTime(new Date(time), timeZone, locale)}`}
    </title>

    <text
      x={x(time)}
      y={BOTTOM + 25}
      textAnchor={
        time === startMs ? "start" :
        time === endMs ? "end" : "middle"
      }
      className={styles.tick}
    >
      {chartWindow === "24h" && time === endMs
  ? "24:00"
  : clock.format(new Date(time))}
    </text>
  </g>
))}

{/* Temperature scale and horizontal gridlines */}
{temperatureScale.ticks.map((value) => (
  <g key={`temperature-${value}`}>
    <line
      x1={LEFT}
      x2={RIGHT}
      y1={y(value, "temperature")}
      y2={y(value, "temperature")}
      className={styles.grid}
    />

    <text
      x={LEFT - 12}
      y={y(value, "temperature")}
      textAnchor="end"
      dominantBaseline="middle"
      className={styles.tick}
    >
      {value}
    </text>
  </g>
))}

{/* Wind scale: right-hand side */}
{windScale.ticks.map((value) => (
  <text
    key={`wind-${value}`}
    x={RIGHT + 12}
    y={y(value, "wind")}
    dominantBaseline="middle"
    className={styles.tick}
  >
    {value}
  </text>
))}

{/* Cloudiness scale: far right, 0–100% */}
<text
  x={CLOUD_AXIS_X}
  y={17}
  textAnchor="middle"
  className={styles.cloudUnit}
>
  ☁
</text>

{[0, 25, 50, 75, 100].map((value) => (
  <text
    key={`cloud-${value}`}
    x={CLOUD_AXIS_X}
    y={BOTTOM - (value / 100) * (BOTTOM - TOP)}
    textAnchor="middle"
    dominantBaseline="middle"
    className={styles.tick}
  >
    {value}%
  </text>
))}

{/* Measurement and forecast lines */}
<g clipPath={`url(#${clipId})`}>
  {series.map((item) => (
    <g key={`${item.field}-${item.kind}`}>
      {item.segments.map((segment, index) => {
        const label = `${item.label} — ${
          item.kind === "measured" ? t.measured : t.forecastStyle
        }`;

        if (segment.length === 1) {
          return (
            <circle
              key={index}
              cx={x(segment[0].time)}
              cy={y(segment[0].value, item.axis)}
              r={3}
              stroke={item.color}
              fill={item.kind === "measured" ? item.color : "white"}
            >
              <title>{label}</title>
            </circle>
          );
        }

        return (
          <polyline
            key={index}
            points={segment.map((point) =>
              `${x(point.time)},${y(point.value, item.axis)}`
            ).join(" ")}
            fill="none"
            stroke={item.color}
            strokeWidth={item.axis === "wind" ? 1.5 : 2}
            strokeDasharray={
              item.kind === "forecast" ? "6 4" : undefined
            }
            vectorEffect="non-scaling-stroke"
          >
            <title>{label}</title>
          </polyline>
        );
      })}
    </g>
  ))}
</g>

{/* Dashed transition between measurements and forecasts */}
{transitionLines.map((item) => (
  <line
    key={`transition-${item.field}`}
    clipPath={`url(#${clipId})`}
    x1={x(item.points[0].time)}
    y1={y(item.points[0].value, item.axis)}
    x2={x(item.points[1].time)}
    y2={y(item.points[1].value, item.axis)}
    stroke={item.color}
    strokeWidth={item.axis === "wind" ? 1.5 : 2}
    strokeDasharray="6 4"
    vectorEffect="non-scaling-stroke"
  >
    <title>
      {`${item.label}: ${t.measured} → ${t.forecastStyle}`}
    </title>
  </line>
))}

          {sourceChanges.map((gap, index) => (
  <g key={`source-${index}`}>
    <title>
      {t.sourceChange}:{" "}
      {sourceNames[locale][gap.fromSource ?? ""] ?? gap.fromSource}
      {" → "}
      {sourceNames[locale][gap.toSource ?? ""] ?? gap.toSource}
    </title>

    <line
      x1={x(gap.to!)}
      x2={x(gap.to!)}
      y1={TOP}
      y2={BOTTOM}
      className={styles.sourceMarker}
    />

    <text
      x={x(gap.to!)}
      y={TOP + 14}
      textAnchor="middle"
      className={styles.markerLabel}
    >
      {index + 1}
    </text>
  </g>
))}

          <path
            d={`M ${LEFT} ${TOP} V ${BOTTOM} H ${RIGHT} V ${TOP}`}
            fill="none"
            className={styles.axis}
          />
        </svg>
      </div>

      <figcaption className={styles.caption}>
  <p>{t.chartDescription}</p>

  <DailyWeatherAvailability
    data={data}
    selectedDate={selectedDate}
    timeZone={timeZone}
    locale={locale}
  />

  {sourceChanges.map((gap, index) => (
    <p key={`source-explanation-${index}`}>
      ({index + 1}) {t.sourceChange}:{" "}
      {sourceNames[locale][gap.fromSource ?? ""] ?? gap.fromSource}
      {" → "}
      {sourceNames[locale][gap.toSource ?? ""] ?? gap.toSource}.
    </p>
  ))}
</figcaption>

    </figure>
  );
}