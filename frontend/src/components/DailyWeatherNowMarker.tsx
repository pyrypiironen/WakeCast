"use client";

import {
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type TouchEvent,
} from "react";

import type { Locale } from "@/lib/i18n";
import type {
  ChartGeometry,
  PreparedDailyWeatherChart,
} from "./daily-weather-chart-data";
import styles from "./DailyWeatherChart.module.css";

interface Props {
  startMs: number;
  endMs: number;
  geometry: ChartGeometry;
  timeZone: string;
  locale: Locale;
  chart: PreparedDailyWeatherChart;
}

interface CursorPosition {
  x: number;
  startMs: number;
  endMs: number;
}

interface WeatherSample {
  timestamp: string;
  kind: "measured" | "forecast";
  temperature: number | null;
  windSpeed: number | null;
  windGust: number | null;
  cloudiness: number | null;
}

const MINUTE_MS = 60_000;
const KEYBOARD_STEP_MINUTES = 15;

const PANEL_WIDTH = 144;
const PANEL_HEIGHT = 108;
const PANEL_GAP = 10;

function formatValue(value: number | null | undefined): string {
  return value != null && Number.isFinite(value)
    ? value.toFixed(1)
    : "–";
}

function findWeatherSample(
  chart: PreparedDailyWeatherChart,
  timeMs: number,
): WeatherSample | null {
  let best: WeatherSample | null = null;
  let bestDistance = Infinity;

  function consider(
    sample: WeatherSample,
    toleranceMs: number,
  ) {
    const timestamp = Date.parse(sample.timestamp);
    const distance = Math.abs(timestamp - timeMs);

    if (
      Number.isFinite(distance) &&
      distance <= toleranceMs &&
      distance < bestDistance
    ) {
      best = sample;
      bestDistance = distance;
    }
  }

  if (chart.daily.observations.status === "ok") {
    for (const point of chart.daily.observations.data.observations) {
      const intervalMinutes = point.resolution_minutes;

      const toleranceMs =
        intervalMinutes !== null &&
        Number.isFinite(intervalMinutes) &&
        intervalMinutes > 0
          ? Math.min(intervalMinutes / 2, 30) * MINUTE_MS
          : 0;

      consider(
        {
          timestamp: point.timestamp,
          kind: "measured",
          temperature: point.temperature,
          windSpeed: point.wind_speed,
          windGust: point.wind_gust,
          cloudiness: point.cloudiness,
        },
        toleranceMs,
      );
    }
  }

  if (chart.daily.forecasts.status === "ok") {
    for (const point of chart.daily.forecasts.data.forecasts) {
      consider(
        {
          timestamp: point.timestamp,
          kind: "forecast",
          temperature: point.temperature,
          windSpeed: point.wind_speed,
          windGust: point.wind_gust,
          cloudiness: point.cloudiness,
        },
        30 * MINUTE_MS,
      );
    }
  }

  return best;
}

function findWaterTemperature(
  chart: PreparedDailyWeatherChart,
  timeMs: number,
): number | null {
  const interval = chart.waterHistory?.heldIntervals.find(
    (item) =>
      Date.parse(item.start) <= timeMs &&
      timeMs < Date.parse(item.end),
  );

  if (interval) return interval.waterTemperature;

  // Include an actual reading at its exact timestamp.
  const exactReading = chart.waterReadings.find(
    (point) => Date.parse(point.timestamp) === timeMs,
  );

  return exactReading?.water_temperature ?? null;
}

export default function DailyWeatherNowMarker({
  startMs,
  endMs,
  geometry,
  timeZone,
  locale,
  chart,
}: Props) {
  const [cursor, setCursor] = useState<CursorPosition | null>(null);

  const { left, right, top, bottom } = geometry;
  const durationMinutes = (endMs - startMs) / MINUTE_MS;

  const markerX =
    cursor?.startMs === startMs && cursor.endMs === endMs
      ? cursor.x
      : null;

  function moveToX(value: number) {
    setCursor({
      x: Math.max(left, Math.min(right, value)),
      startMs,
      endMs,
    });
  }

  function updateFromPointer(event: PointerEvent<SVGRectElement>) {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;

    const point = new DOMPoint(
      event.clientX,
      event.clientY,
    ).matrixTransform(matrix.inverse());

    moveToX(point.x);
  }

  function handlePointerDown(event: PointerEvent<SVGRectElement>) {
    if (event.pointerType !== "touch") {
      updateFromPointer(event);
    }
  }

  function handlePointerMove(event: PointerEvent<SVGRectElement>) {
    if (event.pointerType !== "touch") {
      updateFromPointer(event);
    }
  }

  function updateFromTouch(event: TouchEvent<SVGRectElement>) {
    const touch = event.touches[0];
    if (!touch) return;

    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;

    const point = new DOMPoint(
      touch.clientX,
      touch.clientY,
    ).matrixTransform(matrix.inverse());

    moveToX(point.x);
  }

  const selectedMinute = Math.round(
    (((markerX ?? left) - left) / (right - left)) *
      durationMinutes,
  );

  const selectedTimestamp =
    startMs + selectedMinute * MINUTE_MS;

  const clock = new Intl.DateTimeFormat(
    locale === "fi" ? "fi-FI" : "en-GB",
    {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
  );

  const selectedTime = clock.format(new Date(selectedTimestamp));

  const weather = markerX !== null
    ? findWeatherSample(chart, selectedTimestamp)
    : null;

  const water = markerX !== null
    ? findWaterTemperature(chart, selectedTimestamp)
    : null;

  const wind = weather
    ? `${formatValue(weather.windSpeed)} (${formatValue(weather.windGust)}) m/s`
    : "– (–) m/s";

  const cloud =
    weather?.cloudiness != null &&
    Number.isFinite(weather.cloudiness)
      ? `${Math.round(weather.cloudiness)}%`
      : "–";

  const labels =
    locale === "fi"
      ? {
          air: "Ilma",
          water: "Vesi",
          wind: "Tuuli",
          cloud: "Pilvet",
        }
      : {
          air: "Air",
          water: "Water",
          wind: "Wind",
          cloud: "Cloud",
        };

  function handleKeyDown(event: KeyboardEvent<SVGRectElement>) {
    let nextMinute = selectedMinute;

    switch (event.key) {
      case "ArrowLeft":
        nextMinute -= KEYBOARD_STEP_MINUTES;
        break;
      case "ArrowRight":
        nextMinute += KEYBOARD_STEP_MINUTES;
        break;
      case "Home":
        nextMinute = 0;
        break;
      case "End":
        nextMinute = durationMinutes;
        break;
      default:
        return;
    }

    event.preventDefault();

    const clampedMinute = Math.max(
      0,
      Math.min(durationMinutes, nextMinute),
    );

    moveToX(
      left +
        (clampedMinute / durationMinutes) * (right - left),
    );
  }

  // Position the box to the right unless it would overflow.
  const panelX =
    markerX === null
      ? left
      : markerX + PANEL_GAP + PANEL_WIDTH <= right
        ? markerX + PANEL_GAP
        : markerX - PANEL_GAP - PANEL_WIDTH;

  const panelY = top + 2;

  const rows = [
    {
      label: labels.air,
      value: weather
        ? `${formatValue(weather.temperature)}°C`
        : "–",
    },
    {
      label: labels.water,
      value: water !== null
        ? `${formatValue(water)}°C`
        : "–",
    },
    { label: labels.wind, value: wind },
    { label: labels.cloud, value: cloud },
  ];

  return (
    <>
      <rect
        x={left}
        y={top}
        width={right - left}
        height={bottom - top}
        fill="transparent"
        className={styles.inspectionTarget}
        role="slider"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label={
          locale === "fi"
            ? "Tarkastele sääkuvaajan ajankohtaa"
            : "Inspect weather chart time"
        }
        aria-valuemin={0}
        aria-valuemax={durationMinutes}
        aria-valuenow={selectedMinute}
        aria-valuetext={selectedTime}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") {
            updateFromPointer(event);
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") {
            setCursor(null);
          }
        }}
        onPointerCancel={(event) => {
          if (event.pointerType !== "touch") {
            setCursor(null);
          }
        }}
        onTouchStart={updateFromTouch}
        onTouchMove={updateFromTouch}
        onTouchEnd={() => setCursor(null)}
        onTouchCancel={() => setCursor(null)}
        onFocus={() => {
          if (markerX === null) moveToX(left);
        }}
        onBlur={() => setCursor(null)}
        onKeyDown={handleKeyDown}
      />

      {markerX !== null && (
        <g
          className={styles.nowMarker}
          data-inspection-marker=""
        >
          <line
            x1={markerX}
            x2={markerX}
            y1={top}
            y2={bottom}
            className={styles.nowLine}
          />

          <g className={styles.inspectionPanel}>
            <title>
              {weather
                ? `${
                    weather.kind === "measured"
                      ? locale === "fi" ? "Havainto" : "Observation"
                      : locale === "fi" ? "Ennuste" : "Forecast"
                  }: ${clock.format(new Date(weather.timestamp))}`
                : locale === "fi"
                  ? "Ei säätietoja"
                  : "No weather data"}
            </title>

            <rect
              x={panelX}
              y={panelY}
              width={PANEL_WIDTH}
              height={PANEL_HEIGHT}
              rx={7}
              className={styles.inspectionPanelBackground}
            />

            <text
              x={panelX + 12}
              y={panelY + 20}
              className={styles.inspectionPanelTime}
            >
              {selectedTime}
            </text>

            {rows.map((row, index) => (
              <g key={row.label}>
                <text
                  x={panelX + 12}
                  y={panelY + 43 + index * 18}
                  className={styles.inspectionPanelLabel}
                >
                  {row.label}
                </text>

                <text
                  x={panelX + PANEL_WIDTH - 12}
                  y={panelY + 43 + index * 18}
                  textAnchor="end"
                  className={styles.inspectionPanelValue}
                >
                  {row.value}
                </text>
              </g>
            ))}
          </g>
        </g>
      )}
    </>
  );
}