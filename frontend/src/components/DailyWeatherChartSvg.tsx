import { formatLocalDate, formatLocalTime } from "@/lib/date";
import { translations } from "@/lib/i18n";
import { sourceNames } from "./DailyWeatherAvailability";
import DailyWeatherCloudLayer from "./DailyWeatherCloudLayer";
import DailyWeatherLines from "./DailyWeatherLines";
import DailyWeatherWaterLine from "./DailyWeatherWaterLine";
import DailyWeatherNowMarker from "./DailyWeatherNowMarker";
import type {
  ChartGeometry,
  DailyWeatherChartProps,
  PreparedDailyWeatherChart,
  WeatherVisibility,
} from "./daily-weather-chart-data";
import styles from "./DailyWeatherChart.module.css";

interface DailyWeatherChartSvgProps extends Pick<
  DailyWeatherChartProps,
  "locale" | "timeZone" | "chartWindow"
> {
  chart: PreparedDailyWeatherChart;
  clipId: string;
  visibility: WeatherVisibility;
}

const WIDTH = 960;
const HEIGHT = 310;
const LEFT = 30;
const RIGHT = 848;
const CLOUD_AXIS_X = RIGHT + 72;
const TOP = 34;
const BOTTOM = 270;
const HOUR_MS = 3_600_000;
const PROBABILITY_Y = 4;
const PROBABILITY_HEIGHT = 24;

export default function DailyWeatherChartSvg({
  chart,
  clipId,
  locale,
  timeZone,
  chartWindow,
  visibility,
}: DailyWeatherChartSvgProps) {
  const t = translations[locale].dailyForecast;
  const {
    daily,
    startMs,
    endMs,
    durationMs,
    windScale,
    temperatureScale,
    sourceChanges,
    precipitationCells,
  } = chart;
  function x(time: number): number {
    return LEFT + ((time - startMs) / durationMs) * (RIGHT - LEFT);
  }

  function y(value: number, axis: "wind" | "temperature"): number {
    const scale = axis === "wind" ? windScale : temperatureScale;
    return (
      BOTTOM - ((value - scale.min) / (scale.max - scale.min)) * (BOTTOM - TOP)
    );
  }

  function cloudY(value: number): number {
    const percentage = Math.max(0, Math.min(100, value));
    return BOTTOM - (BOTTOM - TOP) * (percentage / 100);
  }

  const clock = new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  // Vertical gridlines at every hour.
  const hourTicks: number[] = [];

  for (let time = startMs; time <= endMs; time += HOUR_MS) {
    hourTicks.push(time);
  }

  // Visible time labels every 3 hours.
  const timeTicks: number[] = [];

  for (let time = startMs; time < endMs; time += 3 * HOUR_MS) {
    if (endMs - time >= 1.5 * HOUR_MS) {
      timeTicks.push(time);
    }
  }

  timeTicks.push(endMs);

  const geometry: ChartGeometry = {
    clipId,
    left: LEFT,
    right: RIGHT,
    top: TOP,
    bottom: BOTTOM,
    x,
    y,
    cloudY,
  };
  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${translations[locale].parkPage.daily}: ${formatLocalDate(
        daily.start,
        timeZone,
        locale,
      )}`}
    >
      <desc>{t.chartDescription}</desc>

      <defs>
        <clipPath id={clipId}>
          <rect x={LEFT} y={TOP} width={RIGHT - LEFT} height={BOTTOM - TOP} />
        </clipPath>

        <pattern
          id={`${clipId}-missing-cloud`}
          width={8}
          height={8}
          patternUnits="userSpaceOnUse"
        >
          <rect
            width={8}
            height={8}
            className={styles.missingCloudBackground}
          />
          <path
            d="M-2 2L2-2 M0 8L8 0 M6 10L10 6"
            className={styles.missingCloudHatch}
          />
        </pattern>
      </defs>

      {visibility.cloud ? (
        <g data-weather-layer="cloud">
          <DailyWeatherCloudLayer chart={chart} geometry={geometry} />
        </g>
      ) : (
        <rect x={LEFT} y={TOP} width={RIGHT - LEFT} height={BOTTOM - TOP} className={styles.hiddenCloudBackground} />
      )}
      <text x={LEFT - 12} y={15} textAnchor="end" className={styles.unit}>
        °C
      </text>

      <text x={RIGHT + 12} y={15} textAnchor="start" className={styles.unit}>
        m/s
      </text>

      {/* Vertical gridlines every hour */}
      {hourTicks.map((time) => (
        <line
          key={`hour-${time}`}
          x1={x(time)}
          x2={x(time)}
          y1={TOP}
          y2={BOTTOM}
          className={styles.grid}
        />
      ))}

      {/* Time labels every 3 hours */}
      {timeTicks.map((time) => (
        <g key={`time-${time}`}>
          <title>
            {`${formatLocalDate(new Date(time), timeZone, locale)} · ${formatLocalTime(new Date(time), timeZone, locale)}`}
          </title>

          <text
            x={x(time)}
           y={BOTTOM + 25}
            textAnchor="middle"
            className={styles.tick}
          >
            {chartWindow === "24h" && time === endMs
              ? "24:00"
              : clock.format(new Date(time))}
          </text>
        </g>
      ))}


{visibility.precipitationProbability && precipitationCells.map((cell) => {
  // Historical observations have no measured rain probability.
  if (cell.isPast) return null;

  const boxStart = x(cell.time);
  const boxEnd = x(cell.time + HOUR_MS);
  const width = boxEnd - boxStart;
  const center = (boxStart + boxEnd) / 2;
  const known = cell.probability !== null;

  return (
    <g key={`probability-${cell.time}`} data-weather-layer="precipitationProbability">
      <title>
        {`${formatLocalDate(new Date(cell.time), timeZone, locale)}
        ${formatLocalTime(new Date(cell.time), timeZone, locale)}
        — ${t.precipitationProbability}: ${
          known
            ? `${Math.round(cell.probability!)}%`
            : t.probabilityUnavailable
        }`}
      </title>

      <rect
        x={boxStart + 1}
        y={PROBABILITY_Y}
        width={Math.max(0, width - 2)}
        height={PROBABILITY_HEIGHT}
        rx={2}
        className={
          known
            ? styles.probabilityBox
            : styles.probabilityMissing
        }
        fillOpacity={
          known
            ? 0.14 + 0.55 * (cell.probability! / 100)
            : undefined
        }
      />

      <text
        x={center}
        y={PROBABILITY_Y + PROBABILITY_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        className={styles.probabilityValue}
      >
        {known ? `${Math.round(cell.probability!)}%` : "–"}
      </text>
    </g>
  );
})}

      {/* Temperature scale and horizontal gridlines */}
      {temperatureScale.ticks.map((value) => (
        <g key={`temperature-${value}`}>
          <line
            x1={LEFT}
            x2={RIGHT}
            y1={y(value, "temperature")}
            y2={y(value, "temperature")}
            className={styles.grid}
          />

          <text
            x={LEFT - 12}
            y={y(value, "temperature")}
            textAnchor="end"
            dominantBaseline="middle"
            className={styles.tick}
          >
            {value}
          </text>
        </g>
      ))}

      {/* Wind scale: right-hand side */}
      {windScale.ticks.map((value) => (
        <text
          key={`wind-${value}`}
          x={RIGHT + 12}
          y={y(value, "wind")}
          dominantBaseline="middle"
          className={styles.tick}
        >
          {value}
        </text>
      ))}

      {/* Cloudiness scale: far right, 0–100% */}
      <text
        x={CLOUD_AXIS_X}
        y={15}
        textAnchor="middle"
        className={styles.cloudUnit}
      >
        ☁
      </text>

      {[0, 25, 50, 75, 100].map((value) => (
        <text
          key={`cloud-${value}`}
          x={CLOUD_AXIS_X}
          y={BOTTOM - (value / 100) * (BOTTOM - TOP)}
          textAnchor="middle"
          dominantBaseline="middle"
          className={styles.tick}
        >
          {value}%
        </text>
      ))}

      {visibility.water && <DailyWeatherWaterLine
        chart={chart}
        geometry={geometry}
        locale={locale}
        timeZone={timeZone}
      />}
      <DailyWeatherLines chart={chart} geometry={geometry} locale={locale} visibility={visibility} />
      {sourceChanges.map((gap, index) => (
        <g key={`source-${index}`}>
          <title>
            {`${t.sourceChange}: ${
              sourceNames[locale][gap.fromSource ?? ""] ?? gap.fromSource
            } → ${sourceNames[locale][gap.toSource ?? ""] ?? gap.toSource}`}
          </title>

          <line
            x1={x(gap.to!)}
            x2={x(gap.to!)}
            y1={TOP}
            y2={BOTTOM}
            className={styles.sourceMarker}
          />

          <text
            x={x(gap.to!)}
            y={TOP + 14}
            textAnchor="middle"
            className={styles.markerLabel}
          >
            {index + 1}
          </text>
        </g>
      ))}

      <path
        d={`M ${LEFT} ${TOP} V ${BOTTOM} H ${RIGHT} V ${TOP}`}
        fill="none"
        className={styles.axis}
      />
      <DailyWeatherNowMarker
        startMs={startMs}
        endMs={endMs}
        geometry={geometry}
        timeZone={timeZone}
        locale={locale}
        chart={chart}
      />
    </svg>
  );
}
