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
                                <span className={styles.indicator} aria-hidden="true" />
                <span>
                  <span className={styles.labelAndSymbol}>
                    <span>{t[label]} ({unit})</span>
                    <span className={styles.symbol} aria-hidden="true">
                      {key === "precipitationProbability" ? "%" : null}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
