import { localDayRange, parseTimestamp } from "./date";
import type {
  DailyWeatherData,
  WeatherDataResult,
} from "./daily-weather";
import type {
  ParkWaterTemperatureHistoryResponse,
  WaterTemperatureHistoryPoint,
} from "../types/weather";

export interface HeldWaterInterval {
  start: string;
  end: string;
  waterTemperature: number;
  observedAt: string;
  fetchedAt: string;
}

export interface DailyWaterPayload
  extends ParkWaterTemperatureHistoryResponse {
  heldIntervals: HeldWaterInterval[];
}

interface DailyWaterSelection {
  start: string;
  end: string;
  referenceTime: string;
  water: WeatherDataResult<DailyWaterPayload>;
}

export function selectDailyWater(
  input: Pick<DailyWeatherData, "requestedAt" | "water">,
  selectedDate: string,
  timeZone: string,
): DailyWaterSelection {
  const { start, end } = localDayRange(selectedDate, timeZone);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const referenceMs = parseTimestamp(input.requestedAt).getTime();
  const cutoffMs = Math.min(endMs, referenceMs);

  const range = {
    start: start.toISOString(),
    end: end.toISOString(),
    referenceTime: input.requestedAt,
  };

  if (input.water.status !== "ok") {
    return { ...range, water: input.water };
  }

  const payload = input.water.data;

  // A future day must not inherit today's last water reading.
  if (startMs > referenceMs) {
    return {
      ...range,
      water: {
        status: "ok",
        data: {
          ...payload,
          observations: [],
          preceding_observation: null,
          heldIntervals: [],
        },
      },
    };
  }

  function time(point: WaterTemperatureHistoryPoint): number {
    return parseTimestamp(point.timestamp).getTime();
  }

  const samples = [
    ...(payload.preceding_observation
      ? [payload.preceding_observation]
      : []),
    ...payload.observations,
  ]
    .filter((point) => time(point) <= referenceMs && time(point) < endMs)
    .sort((a, b) => time(a) - time(b));

  const preceding = samples.filter((point) => time(point) < startMs).at(-1)
    ?? null;

  const observations = samples.filter((point) => time(point) >= startMs);
  const anchors = [
    ...(preceding ? [preceding] : []),
    ...observations,
  ];

  const heldIntervals: HeldWaterInterval[] = [];

  for (let index = 0; index < anchors.length; index += 1) {
    const point = anchors[index];
    const next = anchors[index + 1];

    const intervalStart = Math.max(startMs, time(point));
    const intervalEnd = Math.min(
      cutoffMs,
      next ? time(next) : cutoffMs,
    );

    if (intervalStart >= intervalEnd) continue;

    heldIntervals.push({
      start: new Date(intervalStart).toISOString(),
      end: new Date(intervalEnd).toISOString(),
      waterTemperature: point.water_temperature,
      observedAt: point.timestamp,
      fetchedAt: point.fetched_at,
    });
  }

  return {
    ...range,
    water: {
      status: "ok",
      data: {
        ...payload,
        observations,
        preceding_observation: preceding,
        heldIntervals,
      },
    },
  };
}