import { localDayRange } from "@/lib/date";
import type {
  DailyWeatherData,
  WeatherDataResult,
} from "@/lib/daily-weather";
import type { Locale } from "@/lib/i18n";
import { measurementNotices } from "@/lib/weather-data-notices";
import {
  getMissingPrecipitationProbabilityRanges,
} from "@/lib/precipitation-probability";
import type {
  PreparedDailyWeatherChart,
} from "./daily-weather-chart-data";
import styles from "./DailyWeatherChart.module.css";

interface Props {
  data: DailyWeatherData;
  selectedDate: string;
  timeZone: string;
  locale: Locale;
  chart: PreparedDailyWeatherChart;
  cloudVisible: boolean;
}

const messages = {
  en: {
    title: "Data availability",
    weatherError: "Weather observations could not be loaded.",
    weatherUnavailable: "Weather observations are unavailable.",
    weatherEmpty: "No measured weather data available for this day.",
    waterError: "Water-temperature observations could not be loaded.",
    waterUnavailable: "Water-temperature observations are unavailable.",
    waterEmpty: "No water-temperature measurements available for this day.",
    forecastError: "Weather forecasts could not be loaded.",
    forecastUnavailable: "Weather forecasts are unavailable.",
    forecastEmpty: "No forecasts available for the remaining hours of this day.",
    probabilityMissing: "Rain probability unavailable",
  },
  fi: {
    title: "Tietojen saatavuus",
    weatherError: "Säähavaintoja ei voitu ladata.",
    weatherUnavailable: "Säähavaintoja ei ole saatavilla.",
    weatherEmpty: "Tälle päivälle ei ole saatavilla mitattuja säätietoja.",
    waterError: "Veden lämpötilahavaintoja ei voitu ladata.",
    waterUnavailable: "Veden lämpötilahavaintoja ei ole saatavilla.",
    waterEmpty: "Tälle päivälle ei ole saatavilla veden lämpötilamittauksia.",
    forecastError: "Sääennusteita ei voitu ladata.",
    forecastUnavailable: "Sääennusteita ei ole saatavilla.",
    forecastEmpty: "Tämän päivän jäljellä oleville tunneille ei ole ennusteita.",
    probabilityMissing: "Sateen todennäköisyystieto puuttuu klo",
  },
} as const;

function hasMissingCloudiness(chart: PreparedDailyWeatherChart): boolean {
  const { startMs, endMs, cloudSeries, cloudBridge } = chart;

  if (endMs <= startMs) return false;

  const coveredRanges: { start: number; end: number }[] = [];

  for (const segment of cloudSeries) {
    if (segment.length < 2) continue;

    coveredRanges.push({
      start: segment[0].time,
      end: segment[segment.length - 1].time,
    });
  }

  if (cloudBridge) {
    coveredRanges.push({
      start: cloudBridge[0].time,
      end: cloudBridge[1].time,
    });
  }

  const visibleRanges = coveredRanges
    .map((range) => ({
      start: Math.max(startMs, range.start),
      end: Math.min(endMs, range.end),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  let coveredUntil = startMs;

  for (const range of visibleRanges) {
    if (range.start > coveredUntil) return true;

    coveredUntil = Math.max(coveredUntil, range.end);

    if (coveredUntil >= endMs) return false;
  }

  return coveredUntil < endMs;
}

export default function DailyWeatherDataStatus({
  data,
  selectedDate,
  timeZone,
  locale,
  chart,
  cloudVisible,
}: Props) {
  const t = messages[locale];
  const { start, end } = localDayRange(selectedDate, timeZone);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const referenceMs = Date.parse(data.requestedAt);
  const notices: string[] = [];

  function withinDay(timestamp: string): boolean {
    const value = Date.parse(timestamp);
    return value >= startMs && value < endMs;
  }

  function checkResult<T>(
    result: WeatherDataResult<T>,
    hasData: (payload: T) => boolean,
    errorMessage: string,
    unavailableMessage: string,
    emptyMessage: string,
  ) {
    if (result.status === "error") {
      notices.push(errorMessage);
    } else if (result.status === "unavailable") {
      notices.push(unavailableMessage);
    } else if (!hasData(result.data)) {
      notices.push(emptyMessage);
    }
  }

  // Measurements are expected only for days that have already begun.
  if (startMs < referenceMs) {
    checkResult(
      data.observations,
      (payload) =>
        payload.observations.some(
          (point) =>
            withinDay(point.timestamp) &&
            Date.parse(point.timestamp) <= referenceMs &&
            [
              point.temperature,
              point.wind_speed,
              point.wind_gust,
              point.cloudiness,
            ].some((value) => value !== null && Number.isFinite(value)),
        ),
      t.weatherError,
      t.weatherUnavailable,
      t.weatherEmpty,
    );

    checkResult(
      data.water,
      (payload) =>
        payload.observations.some(
          (point) =>
            withinDay(point.timestamp) &&
            Date.parse(point.timestamp) <= referenceMs &&
            Number.isFinite(point.water_temperature),
        ),
      t.waterError,
      t.waterUnavailable,
      t.waterEmpty,
    );
  }

  // Historical days do not require forecasts.
  if (endMs > referenceMs) {
    const currentHourStart =
      Math.floor(referenceMs / 3_600_000) * 3_600_000;

    checkResult(
      data.forecasts,
      (payload) =>
        payload.forecasts.some(
          (point) =>
            withinDay(point.timestamp) &&
            Date.parse(point.timestamp) >= currentHourStart,
        ),
      t.forecastError,
      t.forecastUnavailable,
      t.forecastEmpty,
    );
  }

  // Warn about missing rain probability during expected FMI coverage.
  if (data.forecasts.status === "ok" && endMs > referenceMs) {
    const missingRanges =
      getMissingPrecipitationProbabilityRanges(
        data.forecasts.data.forecasts,
        chart.precipitationCells,
        referenceMs,
      );

    if (missingRanges.length > 0) {
      const timeFormatter = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });

      function formatHour(ms: number): string {
        if (ms === endMs) {
          return locale === "fi" ? "24.00" : "24:00";
        }

        const formatted = timeFormatter.format(new Date(ms));

        return locale === "fi"
          ? formatted.replace(":", ".")
          : formatted;
      }

      const intervals = missingRanges
        .map(
          ({ startMs, endMs }) =>
            `${formatHour(startMs)}–${formatHour(endMs)}`,
        )
        .join(", ");

      notices.push(
        locale === "fi"
          ? `${t.probabilityMissing} ${intervals}.`
          : `${t.probabilityMissing}: ${intervals}.`,
      );
    }
  }

    notices.push(
    ...measurementNotices({
      data,
      selectedDate,
      timeZone,
      locale,
    }),
  );

    const showCloudinessNotice =
    cloudVisible && hasMissingCloudiness(chart);

    const uniqueNotices = [...new Set(notices)];
    const noticeCount =
      uniqueNotices.length + (showCloudinessNotice ? 1 : 0);
  
    return (
    <div>
      {noticeCount > 0 && (
        <details className={styles.dataAvailability}>
          <summary
            style={{
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {t.title} ({noticeCount})
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
              style={{
                display: "inline-block",
                verticalAlign: "-3px",
                marginInlineStart: "0.4rem",
              }}
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
              <circle
                cx="12"
                cy="17.5"
                r="1.25"
                fill="#000000"
              />
            </svg>
          </summary>

          <ul
            style={{
              margin: "0.25rem 0 0",
              paddingInlineStart: "1.25rem",
            }}
          >
            {uniqueNotices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
            {showCloudinessNotice && (
          <p
            style={{
              margin: "0.4rem 0 0",
              paddingInlineStart: "1.25rem",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: "1.25rem",
                height: "0.8rem",
                marginInlineEnd: "0.4rem",
                verticalAlign: "-1px",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-chart-sky)",
                backgroundImage:
                  "repeating-linear-gradient(135deg, transparent 0 5px, rgba(156, 163, 175, 1) 5px 8px)",
              }}
            />
            {locale === "fi"
              ? "Pilvisyystietoja ei saatavilla."
              : "Cloudiness data unavailable."}
          </p>
        )}
      </details>
      )}
    </div>
  );
}