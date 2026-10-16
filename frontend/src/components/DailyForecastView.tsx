"use client";

import { useState } from "react";

import {
  addCalendarDays,
  formatLocalDate,
  localDayRange,
} from "@/lib/date";
import { translations, type Locale } from "@/lib/i18n";
import DailyWeatherChart from "./DailyWeatherChart";
import type { DailyWeatherData } from "@/lib/daily-weather";
import DailyWeatherAvailability from "./DailyWeatherAvailability";
import styles from "./DailyForecast.module.css";

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

  const t = translations[locale].dailyForecast;
  const parkText = translations[locale].parkPage;

  const { earliestDate, latestDate } = data;
  const isToday = selectedDate === today;
  const { start } = localDayRange(selectedDate, timeZone);

  function moveDay(offset: number) {
    setSelectedDate((current) => {
      const next = addCalendarDays(current, offset);

      return next >= earliestDate && next <= latestDate
        ? next
        : current;
    });
  }

  const series = [
    { key: "wind", label: t.wind, unit: "m/s" },
    { key: "gust", label: t.gust, unit: "m/s" },
    { key: "air", label: t.air, unit: "°C" },
    { key: "water", label: t.water, unit: "°C" },
  ] as const;

  return (
    <div className={styles.content}>
      <header className={styles.header}>
        <div>
          <h2 id="daily-forecast">{parkText.daily}</h2>
          <p
            className={styles.date}
            aria-live="polite"
            aria-atomic="true"
          >
            {isToday && `${t.today} · `}
            <time dateTime={selectedDate}>
              {formatLocalDate(start, timeZone, locale)}
            </time>
          </p>
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
      />

      <DailyWeatherAvailability
        data={data}
        selectedDate={selectedDate}
        timeZone={timeZone}
        locale={locale}
      />
    </div>
  );
}