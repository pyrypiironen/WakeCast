"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { refreshDailyWeather } from "@/app/actions/refresh-daily-weather";

import { addCalendarDays, localDayRange } from "@/lib/date";
import { translations, type Locale } from "@/lib/i18n";
import DailyWeatherChart from "./DailyWeatherChart";
import type { DailyWeatherData } from "@/lib/daily-weather";
import styles from "./DailyForecast.module.css";
import { defaultChartWindow, type ChartWindow } from "@/lib/chart-window";

interface DailyForecastViewProps {
  slug: string;
  locale: Locale;
  timeZone: string;
  data: DailyWeatherData;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export default function DailyForecastView({
  slug,
  locale,
  timeZone,
  data,
}: DailyForecastViewProps) {

const [liveData, setLiveData] = useState(data);

// TEMPORARY DIAGNOSTIC — remove after debugging.
console.log("[WakeCast frontend forecast]", {
  requestedAt: liveData.requestedAt,
  status: liveData.forecasts.status,
  ...(liveData.forecasts.status === "ok"
    ? {
        fetchedAt: liveData.forecasts.data.fetched_at,
        totalPoints: liveData.forecasts.data.forecasts.length,
        sources: [
          ...new Set(
            liveData.forecasts.data.forecasts.map((p) => p.source),
          ),
        ],
        lastForecast: liveData.forecasts.data.coverage_end,
      }
    : {}),
});
// END OF TEMP

const [nowMs, setNowMs] = useState(() => Date.parse(data.requestedAt));
const [refreshing, setRefreshing] = useState(false);
const [refreshFailed, setRefreshFailed] = useState(false);

const refreshInFlight = useRef(false);
const lastRefreshAttempt = useRef(Date.parse(data.requestedAt));

const refresh = useCallback(async () => {
  if (refreshInFlight.current) return;

  refreshInFlight.current = true;
  lastRefreshAttempt.current = Date.now();
  setRefreshing(true);

  try {
    const next = await refreshDailyWeather(slug, timeZone);

    // Preserve previously loaded data when an API source fails.
    setLiveData((previous) => ({
      ...next,
      forecasts:
        next.forecasts.status === "ok"
          ? next.forecasts
          : previous.forecasts,
      observations:
        next.observations.status === "ok"
          ? next.observations
          : previous.observations,
      water:
        next.water.status === "ok"
          ? next.water
          : previous.water,
    }));

    setRefreshFailed(
      next.forecasts.status !== "ok" ||
      next.observations.status === "error" ||
      next.water.status === "error" ||
      (next.observations.status === "unavailable" &&
        next.observations.httpStatus === 503) ||
      (next.water.status === "unavailable" &&
        next.water.httpStatus === 503),
    );
  } catch {
    setRefreshFailed(true);
  } finally {
    refreshInFlight.current = false;
    setRefreshing(false);
    setNowMs(Date.now());
  }
}, [slug, timeZone]);

useEffect(() => {
  // Synchronize with the browser clock immediately after mounting.
  setNowMs(Date.now());

  // Keep the forecast age current.
  const clockTimer = window.setInterval(() => {
    setNowMs(Date.now());
  }, 30_000);

  return () => window.clearInterval(clockTimer);
}, []);

useEffect(() => {
  function refreshIfNeeded() {
    if (
      document.visibilityState === "visible" &&
      Date.now() - lastRefreshAttempt.current >= REFRESH_INTERVAL_MS
    ) {
      void refresh();
    }
  }

  const interval = window.setInterval(refreshIfNeeded, 30_000);

  document.addEventListener("visibilitychange", refreshIfNeeded);
  window.addEventListener("focus", refreshIfNeeded);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", refreshIfNeeded);
    window.removeEventListener("focus", refreshIfNeeded);
  };
}, [refresh]);
  const today = liveData.today;
  const [selectedDate, setSelectedDate] = useState(today);
  const [chartWindow, setChartWindow] = useState<ChartWindow>(() =>
    defaultChartWindow(data.requestedAt, timeZone),
  );

  const t = translations[locale].dailyForecast;
  const forecastUpdatedAt =
  liveData.forecasts.status === "ok"
    ? liveData.forecasts.data.fetched_at
    : null;

const timestampMs = forecastUpdatedAt
  ? Date.parse(forecastUpdatedAt)
  : NaN;

const minutesOld = Number.isFinite(timestampMs)
  ? Math.max(0, Math.floor((nowMs - timestampMs) / 60_000))
  : null;

const freshnessLabel =
  minutesOld === null
    ? t.updateUnavailable
    : minutesOld === 0
      ? t.updatedJustNow
      : `${t.updated} ${minutesOld} ${t.minutesAgo}`;
  const parkText = translations[locale].parkPage;

  const { earliestDate, latestDate } = liveData;
  const isToday = selectedDate === today;
  const { start } = localDayRange(selectedDate, timeZone);

  const displayDate = new Intl.DateTimeFormat(
    locale === "fi" ? "fi-FI" : "en-GB",
    {
      timeZone,
      day: "numeric",
      month: "long",
    },
  ).format(start);

  function moveDay(offset: number) {
    setSelectedDate((current) => {
      const next = addCalendarDays(current, offset);

      return next >= earliestDate && next <= latestDate ? next : current;
    });
  }

  const series = [
    { key: "air", label: t.air, unit: "°C" },
    { key: "water", label: t.water, unit: "°C" },
    { key: "wind", label: t.wind, unit: "m/s" },
    { key: "gust", label: t.gust, unit: "m/s" },
    { key: "cloud", label: t.cloud, unit: "%" },
  ] as const;

  return (
    <div className={styles.content}>
      <header className={styles.header}>
        <div>
          <h2 id="daily-forecast">{parkText.daily}</h2>
        </div>
        <div className={styles.refreshArea}>
  <div
  className={styles.refreshStatus}
  aria-busy={refreshing}
>
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 11a8 8 0 1 0-2.1 5.4" />
    <path d="M20 4v7h-7" />
  </svg>

  <time dateTime={forecastUpdatedAt ?? undefined}>
    {freshnessLabel}
  </time>
</div>

  {refreshFailed && (
    <span className={styles.refreshWarning} role="status">
      {t.refreshFailed}
    </span>
  )}
</div>
      </header>

      <div className={styles.navigation}>
        <button
          type="button"
          className={styles.dayButton}
          onClick={() => moveDay(-1)}
          disabled={selectedDate <= earliestDate}
          aria-label={t.previousDay}
          title={t.previousDay}
        >
          <span aria-hidden="true">←</span>
        </button>

        <button
          type="button"
          className={styles.dayButton}
          onClick={() => setSelectedDate(today)}
          disabled={isToday}
        >
          {t.today}
        </button>

        <button
          type="button"
          className={styles.dayButton}
          onClick={() => moveDay(1)}
          disabled={selectedDate >= latestDate}
          aria-label={t.nextDay}
          title={t.nextDay}
        >
          <span aria-hidden="true">→</span>
        </button>

        {/* Date in navigation row */}
        <p className={styles.date} aria-live="polite" aria-atomic="true">
          {isToday && `${t.today} · `}
          <time dateTime={selectedDate}>{displayDate}</time>
        </p>

        {/* PARTIAL CHANGE — Chart display selector */}
        <div
          className={styles.chartWindowSwitch}
          role="group"
          aria-label={
            locale === "fi" ? "Kuvaajan aikaväli" : "Chart time range"
          }
        >
          <button
            type="button"
            className={styles.windowButton}
            aria-pressed={chartWindow === "12h"}
            onClick={() => setChartWindow("12h")}
          >
            09–21
          </button>

          <button
            type="button"
            className={styles.windowButton}
            aria-pressed={chartWindow === "24h"}
            onClick={() => setChartWindow("24h")}
          >
            24h
          </button>
        </div>
      </div>

      <ul className={styles.legend} aria-label={t.legend}>
        {series.map(({ key, label, unit }) => (
          <li key={key} className={styles.legendItem}>
            <span
              className={`${styles.swatch} ${styles[key]}`}
              aria-hidden="true"
            />
            <span>
              {label} ({unit})
            </span>
          </li>
        ))}
      </ul>

      <DailyWeatherChart
        data={liveData}
        selectedDate={selectedDate}
        timeZone={timeZone}
        locale={locale}
        chartWindow={chartWindow}
      />
    </div>
  );
}
