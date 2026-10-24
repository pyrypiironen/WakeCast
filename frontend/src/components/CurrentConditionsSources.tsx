import type {
  CurrentReading,
  prepareCurrentConditions,
} from "@/lib/current-conditions";
import {
  formatLocalDate,
  localDateKey,
} from "@/lib/date";
import {
  formatCurrentConditionsTime as formatLocalTime,
} from "@/lib/current-conditions-time";
import { translations, type Locale } from "@/lib/i18n";
import { sourceNames } from "./DailyWeatherAvailability";
import styles from "./CurrentConditions.module.css";

interface CurrentConditionsSourcesProps {
  current: ReturnType<typeof prepareCurrentConditions>;
  nowMs: number;
  locale: Locale;
  timeZone: string;
}

interface ObservationGroup {
  keys: string[];
  labels: string[];
  reading: CurrentReading;
}

export default function CurrentConditionsSources({
  current,
  nowMs,
  locale,
  timeZone,
}: CurrentConditionsSourcesProps) {
  const t = translations[locale].currentConditions;
  const groups = new Map<string, ObservationGroup>();

  for (const key of [
    "temperature",
    "wind",
    "gust",
    "cloud",
    "rain",
  ] as const) {
    const reading = current[key];

    if (reading.value === null || !reading.timestamp) continue;

    const groupKey = JSON.stringify([
      reading.source,
      reading.stationId,
      reading.location,
      reading.timestamp,
      reading.fetchedAt,
    ]);

    const existing = groups.get(groupKey);

    if (existing) {
      existing.keys.push(key);
      existing.labels.push(t[key]);
    } else {
      groups.set(groupKey, {
        keys: [key],
        labels: [t[key]],
        reading,
      });
    }
  }

  function displayTimestamp(timestamp: string): string {
    const instant = new Date(timestamp);
    const time = formatLocalTime(instant, timeZone, locale);

    const isSameLocalDay =
      localDateKey(instant, timeZone) ===
      localDateKey(new Date(nowMs), timeZone);

    return isSameLocalDay
      ? time
      : `${formatLocalDate(instant, timeZone, locale)} · ${time}`;
  }

  function provider(source: string | null): string {
    if (!source) return t.unavailable;

    return sourceNames[locale][source.toLowerCase()] ?? source;
  }

  function timestamps(reading: CurrentReading) {
    return (
      <p className={styles.sourceMeta}>
        {t.measured}:{" "}
        {reading.timestamp ? (
          <time data-measured="" dateTime={reading.timestamp}>
            {displayTimestamp(reading.timestamp)}
          </time>
        ) : (
          t.unavailable
        )}
        {" · "}
        {t.retrieved}:{" "}
        {reading.fetchedAt ? (
          <time dateTime={reading.fetchedAt}>
            {displayTimestamp(reading.fetchedAt)}
          </time>
        ) : (
          t.unavailable
        )}
      </p>
    );
  }

  const waterAvailable =
    current.water.value !== null && current.water.timestamp !== null;

  return (
    <details className={styles.sourceDetails} data-current-sources="">
        <summary>{t.dataSources}</summary>

      <div className={styles.sourceSection}>
        <strong>{t.observations}</strong>

        {groups.size === 0 ? (
          <p>{t.unavailable}</p>
        ) : (
          [...groups.entries()].map(([key, group]) => (
            <div key={key} data-source-fields={group.keys.join(" ")}>
              <p>
                {provider(group.reading.source)}
                {" — "}
                {group.reading.location || t.unavailable}
              </p>
              <p className={styles.sourceMeta}>
                {group.labels.join(", ")}
              </p>
              {timestamps(group.reading)}
            </div>
          ))
        )}
      </div>

      <div className={styles.sourceSection} data-source-fields="water">
        <strong>{t.water}</strong>

        {waterAvailable ? (
          <>
            <p>
              {provider(current.water.source)}
              {" — "}
              {current.water.location || t.unavailable}
            </p>
            {timestamps(current.water)}
          </>
        ) : (
          <p>{t.unavailable}</p>
        )}
      </div>

      <div className={styles.sourceSection} data-source-fields="forecast">
        <strong>{t.forecastForNow}</strong>

        {current.forecast ? (
          <>
            <p>
              {provider(current.forecast.source)}
              {" — "}
              {t.forecastLocation}:{" "}
              {current.probability.location || t.unavailable}
            </p>
            <p className={styles.sourceMeta}>
              {t.retrieved}:{" "}
              {current.probability.fetchedAt ? (
                <time
                  data-forecast-retrieved=""
                  dateTime={current.probability.fetchedAt}
                >
                  {displayTimestamp(current.probability.fetchedAt)}
                </time>
              ) : (
                t.unavailable
              )}
            </p>
          </>
        ) : (
          <p>{t.unavailable}</p>
        )}
      </div>
    </details>
  );
}