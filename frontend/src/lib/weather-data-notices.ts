import { localDayRange } from "./date";
import type { DailyWeatherData } from "./daily-weather";
import type { Locale } from "./i18n";

const MINUTE_MS = 60_000;

const WEATHER_DELAY_MS = 60 * MINUTE_MS;
const WATER_DELAY_MS = 6 * 60 * MINUTE_MS;

interface Props {
  data: DailyWeatherData;
  selectedDate: string;
  timeZone: string;
  locale: Locale;
}

export function measurementNotices({
  data,
  selectedDate,
  timeZone,
  locale,
}: Props): string[] {
  const { start, end } = localDayRange(selectedDate, timeZone);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const referenceMs = Date.parse(data.requestedAt);

  if (startMs >= referenceMs) return [];

  const notices: string[] = [];
  const isCurrentDay = referenceMs < endMs;
  const cutoff = Math.min(endMs, referenceMs);
  const fi = locale === "fi";

  const clock = new Intl.DateTimeFormat(fi ? "fi-FI" : "en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const datedClock = new Intl.DateTimeFormat(fi ? "fi-FI" : "en-GB", {
    timeZone,
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  function time(timestamp: number): string {
    return timestamp === endMs ? "24:00" : clock.format(timestamp);
  }

  function missingRange(label: string, from: number, to: number) {
    notices.push(
      fi
        ? `${label}: havaintoja puuttuu ajalta ${time(from)}–${time(to)}.`
        : `${label}: observations are missing between ${time(from)} and ${time(to)}.`,
    );
  }

  if (data.observations.status === "ok") {
    const points = data.observations.data.observations
      .filter((point) => {
        const timestamp = Date.parse(point.timestamp);
        return timestamp >= startMs && timestamp < endMs &&
          timestamp <= referenceMs;
      })
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    const fields = [
      ["temperature", fi ? "Ilman lämpötila" : "Air temperature"],
      ["wind_speed", fi ? "Tuulen nopeus" : "Wind speed"],
      ["wind_gust", fi ? "Tuulen puuskat" : "Wind gusts"],
      ["cloudiness", fi ? "Pilvisyys" : "Cloudiness"],
    ] as const;

    const hasAnyMeasurement = points.some((point) =>
      fields.some(([field]) =>
        point[field] !== null && Number.isFinite(point[field]),
      ),
    );

    // The existing component handles completely empty days.
    if (hasAnyMeasurement) {
      for (const [field, label] of fields) {
        const valid = points.map((point) =>
          point[field] !== null && Number.isFinite(point[field]),
        );
        const firstValid = valid.indexOf(true);
        const lastValid = valid.lastIndexOf(true);

        if (firstValid === -1) {
          notices.push(
            fi
              ? `${label}: havaintoja ei ole saatavilla tälle päivälle.`
              : `${label}: no observations available for this day.`,
          );
          continue;
        }

        if (firstValid > 0) {
          const firstTime = time(Date.parse(points[firstValid].timestamp));
          notices.push(
            fi
              ? `${label}: havaintoja puuttuu ennen klo ${firstTime}.`
              : `${label}: observations unavailable before ${firstTime}.`,
          );
        }

        if (lastValid < points.length - 1) {
          const lastTime = time(Date.parse(points[lastValid].timestamp));
          notices.push(
            fi
              ? `${label}: havaintoja puuttuu klo ${lastTime} jälkeen.`
              : `${label}: observations unavailable after ${lastTime}.`,
          );
        }

        // Report internal runs of null values once per measurement.
        let index = firstValid + 1;
        while (index < lastValid) {
          if (valid[index]) {
            index += 1;
            continue;
          }

          const previousValid = index - 1;
          while (index < lastValid && !valid[index]) index += 1;

          missingRange(
            label,
            Date.parse(points[previousValid].timestamp),
            Date.parse(points[index].timestamp),
          );
        }
      }

      // Detect missing records independently of individual null values.
      function expectedInterval(index: number): number | null {
        const minutes = points[index].resolution_minutes;
        return minutes !== null && Number.isFinite(minutes) && minutes > 0
          ? minutes * MINUTE_MS
          : null;
      }

      const weatherLabel = fi ? "Säätiedot" : "Weather data";
      const firstTime = Date.parse(points[0].timestamp);
      const firstInterval = expectedInterval(0);

      if (firstInterval !== null && firstTime - startMs > firstInterval * 1.5) {
        missingRange(weatherLabel, startMs, firstTime);
      }

      for (let index = 1; index < points.length; index += 1) {
        const previousTime = Date.parse(points[index - 1].timestamp);
        const nextTime = Date.parse(points[index].timestamp);
        const previousInterval = expectedInterval(index - 1);
        const nextInterval = expectedInterval(index);

        if (previousInterval === null || nextInterval === null) continue;

        const interval = Math.max(previousInterval, nextInterval);
        if (nextTime - previousTime > interval * 1.5) {
          missingRange(weatherLabel, previousTime, nextTime);
        }
      }

      const lastTime = Date.parse(points[points.length - 1].timestamp);
      const lastInterval = expectedInterval(points.length - 1);

      if (
        !isCurrentDay &&
        lastInterval !== null &&
        cutoff - lastTime > lastInterval * 1.5
      ) {
        missingRange(weatherLabel, lastTime, cutoff);
      }
    }

    // Freshness uses actual measurements, not merely returned empty records.
    if (isCurrentDay) {
      const latest = data.observations.data.observations
        .filter((point) =>
          Date.parse(point.timestamp) <= referenceMs &&
          fields.some(([field]) =>
            point[field] !== null && Number.isFinite(point[field]),
          ),
        )
        .reduce(
          (latest, point) => Math.max(latest, Date.parse(point.timestamp)),
          -Infinity,
        );

      if (Number.isFinite(latest) && referenceMs - latest > WEATHER_DELAY_MS) {
        const timestamp = datedClock.format(latest);
        notices.push(
          fi
            ? `Viimeisin säähavainto: ${timestamp}. Päivitykset ovat viivästyneet.`
            : `Latest weather observation: ${timestamp}. Updates are delayed.`,
        );
      }
    }
  }

  if (isCurrentDay && data.water.status === "ok") {
    const payload = data.water.data;
    const readings = [
      ...payload.observations,
      ...(payload.preceding_observation ? [payload.preceding_observation] : []),
    ];

    const latest = readings
      .filter((point) =>
        Number.isFinite(point.water_temperature) &&
        Date.parse(point.timestamp) <= referenceMs,
      )
      .reduce(
        (latest, point) => Math.max(latest, Date.parse(point.timestamp)),
        -Infinity,
      );

    if (Number.isFinite(latest) && referenceMs - latest > WATER_DELAY_MS) {
      const timestamp = datedClock.format(latest);
      notices.push(
        fi
          ? `Viimeisin veden lämpötilahavainto: ${timestamp}. Päivitykset ovat viivästyneet.`
          : `Latest water-temperature observation: ${timestamp}. Updates are delayed.`,
      );
    }
  }

  return [...new Set(notices)];
}