import styles from "./DailyWeatherChart.module.css";
import type { ChartLayerProps } from "./daily-weather-chart-data";

export default function DailyWeatherCloudLayer({
  chart,
  geometry,
}: ChartLayerProps) {
  const { cloudSeries, cloudBridge } = chart;
  const {
    clipId,
    left: LEFT,
    right: RIGHT,
    top: TOP,
    bottom: BOTTOM,
    x,
    cloudY,
  } = geometry;
  return (
    <>
      {/* Background inside the plotting area only */}
      <rect
        x={LEFT}
        y={TOP}
        width={RIGHT - LEFT}
        height={BOTTOM - TOP}
        className={styles.plotBackground}
      />

      {/* Missing cloudiness data: white with diagonal stripes */}
      <g clipPath={`url(#${clipId})`}>
        <rect
          x={LEFT}
          y={TOP}
          width={RIGHT - LEFT}
          height={BOTTOM - TOP}
          fill={`url(#${clipId}-missing-cloud)`}
        />

        {/* Restore blue sky wherever valid cloudiness data exists */}
        {cloudSeries.map((segment, index) => {
          if (segment.length < 2) return null;

          const first = segment[0];
          const last = segment[segment.length - 1];

          return (
            <rect
              key={`cloud-data-${index}`}
              x={x(first.time)}
              y={TOP}
              width={x(last.time) - x(first.time)}
              height={BOTTOM - TOP}
              className={styles.plotBackground}
            />
          );
        })}

        {/* Measurement-to-forecast transition */}
        {cloudBridge && (
          <rect
            x={x(cloudBridge[0].time)}
            y={TOP}
            width={x(cloudBridge[1].time) - x(cloudBridge[0].time)}
            height={BOTTOM - TOP}
            className={styles.plotBackground}
          />
        )}
      </g>

      {/* Continuous cloudiness shading */}
      <g clipPath={`url(#${clipId})`}>
        {cloudSeries.map((segment, index) => {
          if (segment.length < 2) return null;

          const first = segment[0];
          const last = segment[segment.length - 1];

          const points = [
            `${x(first.time)},${BOTTOM}`,
            ...segment.map(
              (point) => `${x(point.time)},${cloudY(point.value)}`,
            ),
            `${x(last.time)},${BOTTOM}`,
          ].join(" ");

          return (
            <polygon
              key={`cloud-segment-${index}`}
              points={points}
              className={styles.cloudShading}
            />
          );
        })}

        {cloudBridge && (
          <polygon
            points={[
              `${x(cloudBridge[0].time)},${BOTTOM}`,
              ...cloudBridge.map(
                (point) => `${x(point.time)},${cloudY(point.value)}`,
              ),
              `${x(cloudBridge[1].time)},${BOTTOM}`,
            ].join(" ")}
            className={styles.cloudShading}
          />
        )}
      </g>
    </>
  );
}
