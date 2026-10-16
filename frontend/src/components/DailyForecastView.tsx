"use client";

import { useState } from "react";

import {
  addCalendarDays,
  localDayRange,
} from "@/lib/date";
import { translations, type Locale } from "@/lib/i18n";
import DailyWeatherChart from "./DailyWeatherChart";
import type { DailyWeatherData } from "@/lib/daily-weather";
import styles from "./DailyForecast.module.css";
import {
  defaultChartWindow,
  type ChartWindow,
} from "@/lib/chart-window";

interface DailyForecastViewProps {
  locale: Locale;
  timeZone: string;
  data: DailyWeatherData;
}

export default function DailyForecastView({
  locale,
  timeZone,
  data,
}: DailyForecastViewProps) {
  const today = data.today;
  const [selectedDate, setSelectedDate] = useState(today);
  const [chartWindow, setChartWindow] = useState<ChartWindow>(
  () => defaultChartWindow(data.requestedAt, timeZone),
  );

  const t = translations[locale].dailyForecast;
  const parkText = translations[locale].parkPage;

  const { earliestDate, latestDate } = data;
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

      return next >= earliestDate && next <= latestDate
        ? next
        : current;
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
        <p className={styles.timezone}>{timeZone}</p>
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
      <p
  className={styles.date}
  aria-live="polite"
  aria-atomic="true"
>
  {isToday && `${t.today} · `}
  <time dateTime={selectedDate}>
    {displayDate}
  </time>
</p>

{/* PARTIAL CHANGE — Chart display selector */}
<div
  className={styles.chartWindowSwitch}
  role="group"
  aria-label={
    locale === "fi"
      ? "Kuvaajan aikaväli"
      : "Chart time range"
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
        data={data}
        selectedDate={selectedDate}
        timeZone={timeZone}
        locale={locale}
        chartWindow={chartWindow}
      />

    </div>
  );
}