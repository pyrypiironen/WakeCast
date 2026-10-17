import { translations, type Locale } from "@/lib/i18n";
import type { WeatherVisibility } from "./daily-weather-chart-data";
import styles from "./DailyWeatherLegend.module.css";

const rows = [
  [
    { key: "temperature", label: "air", unit: "°C" },
    { key: "water", label: "water", unit: "°C" },
    { key: "cloud", label: "cloud", unit: "%" },
  ],
  [
    { key: "wind_speed", label: "wind", unit: "m/s" },
    { key: "wind_gust", label: "gust", unit: "m/s" },
    { key: "precipitationProbability", label: "precipitationProbability", unit: "%" },
  ],
] as const;

interface Props {
  locale: Locale;
  visibility: WeatherVisibility;
  availability: WeatherVisibility;
  onToggle: (key: keyof WeatherVisibility) => void;
}

export default function DailyWeatherLegend({
  locale,
  visibility,
  availability,
  onToggle,
}: Props) {
  const t = translations[locale].dailyForecast;
  return (
    <div className={styles.legend} role="group" aria-label={t.legend}>
      {rows.map((row, index) => (
        <ul className={styles.row} key={index}>
          {row.map(({ key, label, unit }) => (
            <li key={key}>
              <button
                type="button"
                className={`${styles.toggle} ${styles[key]}`}
                aria-pressed={visibility[key]}
                aria-label={`${t[label]} (${unit})`}
                aria-description={!availability[key] ? t.noDataInView : undefined}
                data-available={availability[key]}
                onClick={() => onToggle(key)}
              >
                <span className={styles.indicator} aria-hidden="true">
                  {visibility[key] ? (availability[key] ? "✓" : "–") : ""}
                </span>
                <span>
                  {t[label]} ({unit})
                  {(!visibility[key] || !availability[key]) && (
                    <span className={styles.status}>
                      {!visibility[key] ? t.hidden : t.noDataInView}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
