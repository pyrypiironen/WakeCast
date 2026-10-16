"use client";

import { useId } from "react";
import { translations } from "@/lib/i18n";
import DailyWeatherAvailability, {
  sourceNames,
} from "./DailyWeatherAvailability";
import DailyWeatherChartSvg from "./DailyWeatherChartSvg";
import {
  prepareDailyWeatherChart,
  type DailyWeatherChartProps,
} from "./daily-weather-chart-data";
import styles from "./DailyWeatherChart.module.css";

export default function DailyWeatherChart(props: DailyWeatherChartProps) {
  const { data, selectedDate, timeZone, locale, chartWindow } = props;
  const clipId = useId();
  const t = translations[locale].dailyForecast;
  const chart = prepareDailyWeatherChart(props);
  const { sourceChanges } = chart;

  return (
    <figure className={styles.figure}>
      <div
        className={styles.scroll}
        role="region"
        aria-label={t.chartRegion}
        tabIndex={0}
      >
        <DailyWeatherChartSvg
          chart={chart}
          clipId={clipId}
          locale={locale}
          timeZone={timeZone}
          chartWindow={chartWindow}
        />
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
