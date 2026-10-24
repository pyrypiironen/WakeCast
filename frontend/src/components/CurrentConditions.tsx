"use client";

import { useId, useMemo, useState } from "react";
import type { DailyWeatherData } from "@/lib/daily-weather";
import {
  prepareCurrentConditions,
  type CurrentReading,
} from "@/lib/current-conditions";
import { formatLocalDate } from "@/lib/date";
import {
  formatCurrentConditionsTime as formatLocalTime,
  formatCurrentConditionsInterval as formatCurrentInterval,
} from "@/lib/current-conditions-time";
import { formatPercentage, formatPrecipitation, formatTemperature, formatWindSpeed } from "@/lib/format";
import { translations, type Locale } from "@/lib/i18n";
import { weatherStationDisplayName } from "@/lib/station-display-name";
import forecastStyles from "./DailyForecast.module.css";
import styles from "./CurrentConditions.module.css"
import CurrentConditionsSources from "./CurrentConditionsSources";

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
  const waterSourceNoteId = useId();
  const t = translations[locale].currentConditions;
  const current = useMemo(() => prepareCurrentConditions(data, new Date(nowMs), timeZone), [data, nowMs, timeZone]);
    const weatherStation =
    data.observations.status === "ok"
      ? weatherStationDisplayName(data.observations.data) || t.unavailable
      : t.unavailable;

  const waterStation =
    data.water.status === "ok"
      ? data.water.data.observation_location.trim() || t.unavailable
      : t.unavailable;

  const forecastLocation =
    data.forecasts.status === "ok"
      ? data.forecasts.data.forecast_location.trim() || t.unavailable
      : t.unavailable;

  const forecastStart = current.forecast
    ? Date.parse(current.forecast.timestamp)
    : null;

  const forecastInterval =
    forecastStart !== null
      ? formatCurrentInterval(
          {
            start: forecastStart,
            end: forecastStart + 3_600_000,
          },
          timeZone,
          locale,
        )
      : t.unavailable;
    const observationTimes = [
    current.temperature,
    current.wind,
    current.gust,
    current.cloud,
  ]
    .flatMap((reading) =>
      reading.value !== null && reading.timestamp
        ? [Date.parse(reading.timestamp)]
        : [],
    )
    .filter((timestamp) => Number.isFinite(timestamp));

  const firstObservationTime =
    observationTimes.length > 0 ? Math.min(...observationTimes) : null;

  const lastObservationTime =
    observationTimes.length > 0 ? Math.max(...observationTimes) : null;

  const observationTimeLabel =
    firstObservationTime === null || lastObservationTime === null
      ? "—"
      : firstObservationTime === lastObservationTime
        ? formatLocalTime(
            new Date(firstObservationTime),
            timeZone,
            locale,
          )
        : formatCurrentInterval(
            {
              start: firstObservationTime,
              end: lastObservationTime,
            },
            timeZone,
            locale,
          );
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
          {view === "detailed" ? (
            <table className={styles.detailsTable}>
              <caption className={styles.srOnly}>
                {t.detailedCaption}
              </caption>

              <thead>
                <tr>
                  <th scope="col">
                    <span className={styles.srOnly}>{t.measurement}</span>
                  </th>

                  <th scope="col">
                    {t.observations}
                    <span className={styles.columnMeta}>
                      {weatherStation}
                    </span>
                    <span
                      className={styles.columnMeta}
                      data-observation-range=""
                    >
                      {observationTimeLabel}
                    </span>
                  </th>

                  <th scope="col">
                    {t.forecastForNow}
                    <span
                      className={styles.columnMeta}
                      title={t.forecastLocation}
                    >
                      {forecastLocation}
                    </span>
                    <span className={styles.columnMeta}>
                      {current.forecast ? (
                        <time dateTime={current.forecast.timestamp}>
                          {forecastInterval}
                        </time>
                      ) : (
                        forecastInterval
                      )}
                    </span>
                  </th>
                </tr>
              </thead>

                <tbody>
                {rows.map(({ key, icon, format }) => {
                  const reading = current[key];
                  const provenance = description(reading);

                  const observationValue =
                    key === "probability" ? null : reading.value;

                  const label = `${t[key]}${
                    reading.interval
                      ? ` ${formatCurrentInterval(
                          reading.interval,
                          timeZone,
                          locale,
                        )}`
                      : ""
                  }`;
                  const showWaterAsterisk =
                    key === "water" && reading.value !== null;
                  const forecastValue =
                    key === "temperature"
                      ? current.forecast?.temperature ?? null
                      : key === "wind"
                        ? current.forecast?.wind_speed ?? null
                        : key === "gust"
                          ? current.forecast?.wind_gust ?? null
                          : key === "cloud"
                            ? current.forecast?.cloudiness ?? null
                            : key === "probability"
                              ? current.probability.value
                              : null;

                  const forecastProvenance = description({
                    ...current.probability,
                    value: forecastValue,
                  });

                  return (
                    <tr key={key} data-detailed-condition={key}>
                      <th scope="row">
                        <span aria-hidden="true">{icon}</span>{" "}
                        {label}
                      </th>

                      <td
                        title={
                          key === "probability" ? undefined : provenance
                        }
                      >
                        <span
                          className={styles.measurementValue}
                          aria-describedby={
                            showWaterAsterisk ? waterSourceNoteId : undefined
                          }
                        >
                          {key === "probability"
                            ? null
                            : format(observationValue, locale)}
                          {showWaterAsterisk && " *"}
                        </span>
                        {key !== "probability" && (
                          <span className={styles.srOnly}>
                            {" — "}{provenance}
                          </span>
                        )}
                      </td>

                      <td
                        title={
                          key === "water" || key === "rain"
                            ? undefined
                            : forecastProvenance
                        }
                      >
                        <span className={styles.measurementValue}>
                          {key === "water" || key === "rain"
                            ? null
                            : format(forecastValue, locale)}
                        </span>
                          {key !== "water" && key !== "rain" && (
                          <span className={styles.srOnly}>
                            {" — "}{forecastProvenance}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
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

          {view === "detailed" && (
          <p id={waterSourceNoteId} className={styles.waterSourceNote}>
              * {waterStation}
            </p>
          )}

          <CurrentConditionsSources
            key="current-sources"
            current={current}
            nowMs={nowMs}
            locale={locale}
            timeZone={timeZone}
          />
        </div>
        {/* Reserved for the wind-direction visualization; no invented bearing or new chart. */}
        <div className={styles.windSlot} aria-hidden="true" />
      </div>
    </>
  );
}
