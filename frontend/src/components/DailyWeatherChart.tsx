"use client";

import { useId, useState } from "react";
import { translations } from "@/lib/i18n";
import DailyWeatherAvailability, {
  sourceNames,
} from "./DailyWeatherAvailability";
import DailyWeatherChartSvg from "./DailyWeatherChartSvg";
import DailyWeatherLegend from "./DailyWeatherLegend";
import {
  prepareDailyWeatherChart,
  chartWeatherAvailability,
  defaultWeatherVisibility,
  type DailyWeatherChartProps,
} from "./daily-weather-chart-data";
import styles from "./DailyWeatherChart.module.css";

export default function DailyWeatherChart(props: DailyWeatherChartProps) {
  const { data, selectedDate, timeZone, locale, chartWindow } = props;
  const clipId = useId();
  // This component stays mounted across day/window changes and data refreshes.
  const [visibility, setVisibility] = useState(defaultWeatherVisibility);
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
          visibility={visibility}
        />
      </div>
      <figcaption className={styles.caption}>
        <DailyWeatherLegend
          locale={locale}
          visibility={visibility}
          availability={chartWeatherAvailability(chart)}
          onToggle={(key) =>
            setVisibility((current) => ({ ...current, [key]: !current[key] }))
          }
        />
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
