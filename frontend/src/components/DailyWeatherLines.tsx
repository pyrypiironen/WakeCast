import { translations, type Locale } from "@/lib/i18n";
import type { ChartLayerProps, WeatherVisibility } from "./daily-weather-chart-data";

export default function DailyWeatherLines({
  chart,
  geometry,
  locale,
  visibility,
}: ChartLayerProps & { locale: Locale; visibility: WeatherVisibility }) {
  const t = translations[locale].dailyForecast;
  const { series, transitionLines } = chart;
  const { clipId, x, y } = geometry;
  return (
    <>
      {/* Measurement and forecast lines */}
      <g clipPath={`url(#${clipId})`}>
        {series.filter((item) => visibility[item.field]).map((item) => (
          <g key={`${item.field}-${item.kind}`} data-weather-layer={item.field}>
            {item.segments.map((segment, index) => {
              const label = `${item.label} — ${
                item.kind === "measured" ? t.measured : t.forecastStyle
              }`;

              if (segment.length === 1) {
                return (
                  <circle
                    key={index}
                    cx={x(segment[0].time)}
                    cy={y(segment[0].value, item.axis)}
                    r={3}
                    stroke={item.color}
                    fill={item.kind === "measured" ? item.color : "white"}
                  >
                    <title>{label}</title>
                  </circle>
                );
              }

              return (
                <polyline
                  key={index}
                  points={segment
                    .map(
                      (point) =>
                        `${x(point.time)},${y(point.value, item.axis)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={item.axis === "wind" ? 1.5 : 2}
                  strokeDasharray={item.kind === "forecast" ? "6 4" : undefined}
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{label}</title>
                </polyline>
              );
            })}
          </g>
        ))}
      </g>

      {/* Dashed transition between measurements and forecasts */}
      {transitionLines.filter((item) => visibility[item.field]).map((item) => (
        <line
          data-weather-layer={item.field}
          key={`transition-${item.field}`}
          clipPath={`url(#${clipId})`}
          x1={x(item.points[0].time)}
          y1={y(item.points[0].value, item.axis)}
          x2={x(item.points[1].time)}
          y2={y(item.points[1].value, item.axis)}
          stroke={item.color}
          strokeWidth={item.axis === "wind" ? 1.5 : 2}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        >
          <title>{`${item.label}: ${t.measured} → ${t.forecastStyle}`}</title>
        </line>
      ))}
    </>
  );
}
