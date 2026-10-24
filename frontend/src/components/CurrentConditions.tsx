"use client";

import { useId, useMemo, useState } from "react";
import type { DailyWeatherData } from "@/lib/daily-weather";
import { formatCurrentInterval, prepareCurrentConditions, type CurrentReading } from "@/lib/current-conditions";
import { formatLocalDate, formatLocalTime } from "@/lib/date";
import { formatPercentage, formatPrecipitation, formatTemperature, formatWindSpeed } from "@/lib/format";
import { translations, type Locale } from "@/lib/i18n";
import forecastStyles from "./DailyForecast.module.css";
import styles from "./CurrentConditions.module.css";

interface CurrentConditionsProps {
  data: DailyWeatherData;
  nowMs: number;
  locale: Locale;
  timeZone: string;
  refreshFailed?: boolean;
}

export default function CurrentConditions({ data, nowMs, locale, timeZone, refreshFailed = false }: CurrentConditionsProps) {
  const [view, setView] = useState<"simple" | "detailed">("simple");
  const panelId = useId();
  const t = translations[locale].currentConditions;
  const current = useMemo(() => prepareCurrentConditions(data, new Date(nowMs), timeZone), [data, nowMs, timeZone]);
  const rows = [
    { key: "temperature", icon: "🌡️", format: formatTemperature },
    { key: "water", icon: "🌊", format: formatTemperature },
    { key: "wind", icon: "💨", format: formatWindSpeed },
    { key: "gust", icon: "🌬️", format: formatWindSpeed },
    { key: "cloud", icon: "☁️", format: formatPercentage },
    { key: "rain", icon: "🌧️", format: formatPrecipitation },
    { key: "probability", icon: "☔", format: formatPercentage },
  ] as const;

  function description(reading: CurrentReading) {
    const stamp = (value: string) => `${formatLocalDate(new Date(value), timeZone, locale)} ${formatLocalTime(new Date(value), timeZone, locale)}`;
    return [
      reading.kind === "forecast" ? t.forecast : t.measured,
      reading.source, reading.location,
      reading.timestamp && stamp(reading.timestamp),
      reading.fetchedAt && `${t.retrieved}: ${stamp(reading.fetchedAt)}`,
    ].filter(Boolean).join(" · ");
  }

  return (
    <>
      <header className={styles.header}>
        <h2 id="current-conditions">{translations[locale].parkPage.current}</h2>
        <div className={styles.switch} role="group" aria-label={t.view}>
          {(["simple", "detailed"] as const).map((mode) => (
            <button key={mode} type="button" className={forecastStyles.windowButton}
              aria-pressed={view === mode} aria-controls={panelId} onClick={() => setView(mode)}>
              {t[mode]}
            </button>
          ))}
        </div>
      </header>
      {refreshFailed && <p className={styles.warning} role="status">{t.refreshFailed}</p>}
      <div className={styles.layout}>
        <div id={panelId}>
          {view === "detailed" ? <p>{t.detailedPlaceholder}</p> : (
            <dl className={styles.summary}>
              {rows.map(({ key, icon, format }) => {
                const reading = current[key];
                const label = `${t[key]}${reading.interval ? ` ${formatCurrentInterval(reading.interval, timeZone, locale)}` : ""}`;
                const provenance = description(reading);
                return (
                  <div key={key} className={styles.row} data-condition={key}>
                    <dt>
                      <span aria-hidden="true" className={styles.icon}>{icon}</span>{label}
                      <small className={styles.metadata}>
                        {reading.kind === "forecast" ? t.forecast : t.measured}
                        {reading.value === null ? ` · ${reading.status === "error" ? t.loadError : t.unavailable}` :
                          reading.timestamp && <> · <time dateTime={reading.timestamp}>{formatLocalTime(new Date(reading.timestamp), timeZone, locale)}</time></>}
                        {reading.stale && <span className={styles.warning}> · {t.delayed}</span>}
                        {reading.olderSample && <span className={styles.warning}> · {t.earlier}</span>}
                      </small>
                    </dt>
                    <dd title={provenance}>
                      {format(reading.value, locale)}
                      <span className={styles.srOnly}> — {provenance}</span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </div>
        {/* Reserved for the wind-direction visualization; no invented bearing or new chart. */}
        <div className={styles.windSlot} aria-hidden="true" />
      </div>
    </>
  );
}
