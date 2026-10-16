"use client";

import { useId } from "react";

import {
  buildLineSeries,
  createChartScale,
  type ChartBreak,
  type ChartBreakReason,
} from "@/lib/chart-lines";
import { selectDailyAirWeather } from "@/lib/daily-series";
import type { DailyWeatherData } from "@/lib/daily-weather";
import {
  formatLocalDate,
  formatLocalTime,
} from "@/lib/date";
import { translations, type Locale } from "@/lib/i18n";
import styles from "./DailyWeatherChart.module.css";

interface DailyWeatherChartProps {
  data: DailyWeatherData;
  selectedDate: string;
  timeZone: string;
  locale: Locale;
}

const WIDTH = 900;
const HEIGHT = 320;
const LEFT = 52;
const RIGHT = 848;
const TOP = 30;
const BOTTOM = 270;
const HOUR_MS = 3_600_000;

export default function DailyWeatherChart({
  data,
  selectedDate,
  timeZone,
  locale,
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

  const startMs = Date.parse(daily.start);
  const endMs = Date.parse(daily.end);
  const durationMs = endMs - startMs;

  const definitions = [
    { field: "wind_speed", label: t.wind, color: "#216447", axis: "wind" },
    { field: "wind_gust", label: t.gust, color: "#60956d", axis: "wind" },
    { field: "temperature", label: t.air, color: "#c46622", axis: "temperature" },
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
      ...buildLineSeries(forecasts.map((point) => ({
        timestamp: point.timestamp,
        value: point[definition.field],
        source: point.source,
        // The current forecast feed is hourly.
        // Larger gaps remain separate points/segments.
        intervalMinutes: 60,
      }))),
    },
  ]);

  const windScale = createChartScale(
    series
      .filter((item) => item.axis === "wind")
      .flatMap((item) => item.segments.flatMap(
        (segment) => segment.map((point) => point.value),
      )),
    0,
    15,
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

  const clock = new Intl.DateTimeFormat(
    locale === "fi" ? "fi-FI" : "en-GB",
    {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
  );

  const timeTicks: number[] = [];
  for (let time = startMs; time < endMs; time += 3 * HOUR_MS) {
    if (endMs - time >= 1.5 * HOUR_MS) timeTicks.push(time);
  }
  timeTicks.push(endMs);

  const reasonLabels: Record<ChartBreakReason, string> = {
    "missing-value": t.missingValue,
    "missing-sample": t.missingSample,
    "source-change": t.sourceChange,
    "unknown-interval": t.unknownInterval,
    "interval-change": t.intervalChange,
    "duplicate-timestamp": t.duplicateTimestamp,
    "invalid-timestamp": t.invalidTimestamp,
  };

  // Combine identical breaks across wind, gust and temperature.
  const grouped = new Map<string, {
    gap: ChartBreak;
    kind: "measured" | "forecast";
    labels: string[];
  }>();

  for (const item of series) {
    for (const gap of item.breaks) {
      const key = JSON.stringify([
        item.kind,
        gap.from,
        gap.to,
        gap.fromSource,
        gap.toSource,
        [...gap.reasons].sort(),
      ]);

      const existing = grouped.get(key);
      if (existing) {
        if (!existing.labels.includes(item.label)) {
          existing.labels.push(item.label);
        }
      } else {
        grouped.set(key, {
          gap,
          kind: item.kind,
          labels: [item.label],
        });
      }
    }
  }

  const explanations = [...grouped.values()];

  function gapTime(gap: ChartBreak): string {
    if (gap.from === null && gap.to === null) return t.unknownTime;

    const from = gap.from === null
      ? t.dayStart
      : formatLocalTime(new Date(gap.from), timeZone, locale);
    const to = gap.to === null
      ? t.dayEnd
      : formatLocalTime(new Date(gap.to), timeZone, locale);

    return `${from} – ${to}`;
  }

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
          </defs>

          <text x={LEFT} y={17} className={styles.unit}>m/s</text>
          <text x={RIGHT} y={17} textAnchor="end" className={styles.unit}>
            °C
          </text>

          {timeTicks.map((time) => (
            <g key={time}>
              <title>
                {formatLocalDate(new Date(time), timeZone, locale)}
                {" · "}
                {formatLocalTime(new Date(time), timeZone, locale)}
              </title>
              <line
                x1={x(time)} x2={x(time)}
                y1={TOP} y2={BOTTOM}
                className={styles.grid}
              />
              <text
                x={x(time)}
                y={BOTTOM + 25}
                textAnchor={
                  time === startMs ? "start" :
                  time === endMs ? "end" : "middle"
                }
                className={styles.tick}
              >
                {clock.format(new Date(time))}
              </text>
            </g>
          ))}

          {windScale.ticks.map((value) => (
            <g key={`wind-${value}`}>
              <line
                x1={LEFT} x2={RIGHT}
                y1={y(value, "wind")} y2={y(value, "wind")}
                className={styles.grid}
              />
              <text
                x={LEFT - 12}
                y={y(value, "wind")}
                textAnchor="end"
                dominantBaseline="middle"
                className={styles.tick}
              >
                {value}
              </text>
            </g>
          ))}

          {temperatureScale.ticks.map((value) => (
            <text
              key={`temperature-${value}`}
              x={RIGHT + 12}
              y={y(value, "temperature")}
              dominantBaseline="middle"
              className={styles.tick}
            >
              {value}
            </text>
          ))}

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
                      strokeWidth={2}
                      strokeDasharray={item.kind === "forecast" ? "6 4" : undefined}
                      vectorEffect="non-scaling-stroke"
                    >
                      <title>{label}</title>
                    </polyline>
                  );
                })}
              </g>
            ))}
          </g>

          {explanations.map(({ gap }, index) => {
            if (!gap.reasons.includes("source-change") || gap.to === null) {
              return null;
            }

            return (
              <g key={`source-${index}`}>
                <title>
                  {t.sourceChange}: {gap.fromSource} → {gap.toSource}
                </title>
                <line
                  x1={x(gap.to)} x2={x(gap.to)}
                  y1={TOP} y2={BOTTOM}
                  className={styles.sourceMarker}
                />
                <text
                  x={x(gap.to)}
                  y={TOP + 14}
                  textAnchor="middle"
                  className={styles.markerLabel}
                >
                  {index + 1}
                </text>
              </g>
            );
          })}

          <path
            d={`M ${LEFT} ${TOP} V ${BOTTOM} H ${RIGHT} V ${TOP}`}
            fill="none"
            className={styles.axis}
          />
        </svg>
      </div>

      <figcaption className={styles.caption}>
        <p>{t.chartDescription}</p>
        <p>{t.dayLength}: {daily.durationHours} h.</p>
      </figcaption>

      {explanations.length > 0 && (
        <details className={styles.explanations}>
          <summary>{t.breakDetails} ({explanations.length})</summary>
          <ol>
            {explanations.map(({ gap, kind, labels }, index) => (
              <li key={index}>
                <strong>
                  {labels.join(", ")} —{" "}
                  {kind === "measured" ? t.measured : t.forecastStyle}
                </strong>
                <div>{gapTime(gap)}</div>
                <div>
                  {gap.reasons.map((reason) => reasonLabels[reason]).join("; ")}
                </div>
                {gap.reasons.includes("source-change") && (
                  <div>{gap.fromSource} → {gap.toSource}</div>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </figure>
  );
}