import type {
  CurrentReading,
  prepareCurrentConditions,
} from "@/lib/current-conditions";
import { formatLocalDate, localDateKey } from "@/lib/date";
import {
  formatCurrentConditionsTime,
} from "@/lib/current-conditions-time";
import { translations, type Locale } from "@/lib/i18n";
import styles from "./CurrentConditions.module.css";

interface Props {
  current: ReturnType<typeof prepareCurrentConditions>;
  nowMs: number;
  timeZone: string;
  locale: Locale;
}

const messages = {
  en: {
    title: "Data availability",
    weatherError: "Weather observations could not be loaded.",
    weatherUnavailable: "Weather observations are unavailable.",
    waterError: "Water-temperature observations could not be loaded.",
    waterUnavailable: "Water-temperature observations are unavailable.",
    forecastError: "Weather forecasts could not be loaded.",
    forecastUnavailable: "The current-hour forecast is unavailable.",
    observationMissing: "Observation unavailable.",
    forecastMissing: "Forecast value unavailable.",
    latestMeasurement: "Latest measurement",
    latestInterval: "Latest measured interval",
    delayed: "Updates are delayed.",
    newerMissing: "Newer readings are missing.",
    forecastDelayed: "Forecast updates are delayed.",
    retrieved: "Retrieved",
  },
  fi: {
    title: "Tietojen saatavuus",
    weatherError: "Säähavaintoja ei voitu ladata.",
    weatherUnavailable: "Säähavaintoja ei ole saatavilla.",
    waterError: "Veden lämpötilahavaintoja ei voitu ladata.",
    waterUnavailable: "Veden lämpötilahavaintoja ei ole saatavilla.",
    forecastError: "Sääennusteita ei voitu ladata.",
    forecastUnavailable: "Kuluvan tunnin ennustetta ei ole saatavilla.",
    observationMissing: "Havaintoa ei ole saatavilla.",
    forecastMissing: "Ennustearvoa ei ole saatavilla.",
    latestMeasurement: "Viimeisin mittaus",
    latestInterval: "Viimeisin mitattu aikaväli",
    delayed: "Päivitykset ovat viivästyneet.",
    newerMissing: "Uudempia havaintoja puuttuu.",
    forecastDelayed: "Ennusteen päivitykset ovat viivästyneet.",
    retrieved: "Haettu",
  },
} as const;

export default function CurrentConditionsAvailability({
  current,
  nowMs,
  timeZone,
  locale,
}: Props) {
  const t = messages[locale];
  const labels = translations[locale].currentConditions;
  const notices: string[] = [];

  function timestamp(value: string | number): string {
    const instant = new Date(value);
    const time = formatCurrentConditionsTime(instant, timeZone, locale);

    return localDateKey(instant, timeZone) ===
      localDateKey(new Date(nowMs), timeZone)
      ? time
      : `${formatLocalDate(instant, timeZone, locale)} · ${time}`;
  }

  function observationNotice(label: string, reading: CurrentReading) {
    if (reading.value === null || !Number.isFinite(reading.value)) {
      notices.push(`${label}: ${t.observationMissing}`);
      return;
    }

    if (!reading.stale && !reading.olderSample) return;

    const latest = reading.interval
      ? `${t.latestInterval}: ${timestamp(reading.interval.start)}–${timestamp(
          reading.interval.end,
        )}.`
      : reading.timestamp
        ? `${t.latestMeasurement}: ${timestamp(reading.timestamp)}.`
        : "";

    const reason = reading.olderSample ? t.newerMissing : t.delayed;

    notices.push(`${label}: ${latest} ${reason}`.trim());
  }

  // A source-level failure replaces its individual missing-value notices.
  if (current.temperature.status === "error") {
    notices.push(t.weatherError);
  } else if (current.temperature.status === "unavailable") {
    notices.push(t.weatherUnavailable);
  } else {
    for (const key of ["temperature", "wind", "gust", "cloud"] as const) {
    observationNotice(labels[key], current[key]);
}

// Rain describes a completed interval. Newer observations of other
// measurements do not establish that a newer rainfall interval is due.
observationNotice(labels.rain, {
  ...current.rain,
  olderSample: false,
});
  }

  if (current.water.status === "error") {
    notices.push(t.waterError);
  } else if (current.water.status === "unavailable") {
    notices.push(t.waterUnavailable);
  } else {
    observationNotice(labels.water, current.water);
  }

  if (current.probability.status === "error") {
    notices.push(t.forecastError);
  } else if (
    current.probability.status === "unavailable" ||
    !current.forecast
  ) {
    notices.push(t.forecastUnavailable);
  } else {
    const forecastFields = [
      ["temperature", current.forecast.temperature],
      ["wind", current.forecast.wind_speed],
      ["gust", current.forecast.wind_gust],
      ["cloud", current.forecast.cloudiness],
      ["probability", current.probability.value],
    ] as const;

    for (const [key, value] of forecastFields) {
      if (value == null || !Number.isFinite(value)) {
        notices.push(`${labels[key]}: ${t.forecastMissing}`);
      }
    }

    // This freshness flag describes the forecast snapshot, not just probability.
    if (current.probability.stale) {
      const retrieved = current.probability.fetchedAt
        ? ` ${t.retrieved}: ${timestamp(current.probability.fetchedAt)}.`
        : "";

      notices.push(`${t.forecastDelayed}${retrieved}`);
    }
  }

  const uniqueNotices = [...new Set(notices)];

  if (uniqueNotices.length === 0) return null;

  return (
    <details
      className={styles.sourceDetails}
      data-current-availability=""
    >
      <summary>
        {t.title} ({uniqueNotices.length})
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          className={styles.availabilityIcon}
        >
          <path
            d="M12 3 22 21H2Z"
            fill="#FFEB00"
            stroke="#000000"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M12 9v5"
            stroke="#000000"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="12" cy="17.5" r="1.25" fill="#000000" />
        </svg>
      </summary>

      <ul className={styles.availabilityList}>
        {uniqueNotices.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
    </details>
  );
}