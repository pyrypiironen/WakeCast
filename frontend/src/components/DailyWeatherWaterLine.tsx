import { formatLocalDate, formatLocalTime } from "@/lib/date";
import { translations, type Locale } from "@/lib/i18n";
import type { ChartLayerProps } from "./daily-weather-chart-data";

export default function DailyWeatherWaterLine({
  chart,
  geometry,
  locale,
  timeZone,
}: ChartLayerProps & { locale: Locale; timeZone: string }) {
  const t = translations[locale].dailyForecast;
  const { waterPoints, waterReadings, waterHistory } = chart;
  const { clipId, x, y } = geometry;
  // Step-shaped line: hold each reading until the next measurement.
  // The path ends at the last measured timestamp.
  const waterPath =
    waterPoints.length > 1
      ? waterPoints
          .map((point, index) => {
            const pointX = x(point.time);
            const pointY = y(point.value, "temperature");

            if (index === 0) {
              return `M ${pointX} ${pointY}`;
            }

            return `H ${pointX} V ${pointY}`;
          })
          .join(" ")
      : null;

  return (
    <g clipPath={`url(#${clipId})`} data-weather-layer="water">
      {waterPath && (
        <path
          d={waterPath}
          fill="none"
          stroke="#287BB5"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        >
          <title>{`${t.water} — ${t.measured}`}</title>
        </path>
      )}

      {/* Actual measurement timestamps */}
      {waterReadings.map((point) => {
        const measuredAt = new Date(point.timestamp);

        return (
          <circle
            key={point.timestamp}
            cx={x(measuredAt.getTime())}
            cy={y(point.water_temperature, "temperature")}
            r={1.75}
            fill="#287BB5"
          >
            <title>
              {`${t.water}: ${point.water_temperature} °C — ${formatLocalDate(
                measuredAt,
                timeZone,
                locale,
              )} ${formatLocalTime(measuredAt, timeZone, locale)} — ${
                waterHistory?.observation_location ?? ""
              }`}
            </title>
          </circle>
        );
      })}
    </g>
  );
}
