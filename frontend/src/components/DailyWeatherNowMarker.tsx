"use client";

import { useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n";
import type { ChartGeometry } from "./daily-weather-chart-data";
import styles from "./DailyWeatherChart.module.css";

interface Props {
  startMs: number;
  endMs: number;
  geometry: ChartGeometry;
  timeZone: string;
  locale: Locale;
}

const MINUTE_MS = 60_000;
const LABEL_WIDTH = 38;
const LABEL_HEIGHT = 11;

export default function DailyWeatherNowMarker({
  startMs,
  endMs,
  geometry,
  timeZone,
  locale,
}: Props) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    let timer: number | undefined;

    function synchronize() {
      window.clearTimeout(timer);

      if (document.hidden) return;

      const now = Date.now();

      // Position and label represent the current minute.
      setNowMs(Math.floor(now / MINUTE_MS) * MINUTE_MS);

      // Schedule at the next minute boundary.
      timer = window.setTimeout(
        synchronize,
        MINUTE_MS - (now % MINUTE_MS),
      );
    }

    // Start after hydration, keeping server/client markup consistent.
    timer = window.setTimeout(synchronize, 0);

    document.addEventListener("visibilitychange", synchronize);
    window.addEventListener("focus", synchronize);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", synchronize);
      window.removeEventListener("focus", synchronize);
    };
  }, []);

  // The selected day's window uses actual timezone-aware timestamps.
  // Historical/future days and times outside the window have no marker.
  if (nowMs === null || nowMs < startMs || nowMs >= endMs) {
    return null;
  }

  const { left, right, top, bottom, x } = geometry;
  const markerX = x(nowMs);

  const labelX = Math.max(
    left,
    Math.min(markerX - LABEL_WIDTH / 2, right - LABEL_WIDTH),
  );

  // Use HH:mm in both languages, always in the park's timezone.
  const timeLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(nowMs));

  const accessibleLabel =
    `${locale === "fi" ? "Nykyinen aika" : "Current time"}: ` +
    `${timeLabel} (${timeZone})`;

  return (
    <g
      className={styles.nowMarker}
      data-now-marker=""
      role="img"
      aria-label={accessibleLabel}
    >
      <title>{accessibleLabel}</title>

      <line
        x1={markerX}
        x2={markerX}
        y1={top}
        y2={bottom}
        className={styles.nowLine}
      />

      <rect
        x={labelX}
        y={bottom + 2}
        width={LABEL_WIDTH}
        height={LABEL_HEIGHT}
        rx={2}
        className={styles.nowLabelBackground}
      />

      <text
        x={labelX + LABEL_WIDTH / 2}
        y={bottom + 2 + LABEL_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        className={styles.nowLabel}
      >
        {timeLabel}
      </text>
    </g>
  );
}