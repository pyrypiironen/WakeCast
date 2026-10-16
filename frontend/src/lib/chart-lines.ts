export interface ChartPoint {
  timestamp: string;
  value: number | null;
  source: string;
  intervalMinutes: number | null;
}

export interface ChartCoordinate {
  time: number;
  value: number;
}

export type ChartBreakReason =
  | "missing-value"
  | "missing-sample"
  | "source-change"
  | "unknown-interval"
  | "interval-change"
  | "duplicate-timestamp"
  | "invalid-timestamp";

export interface ChartBreak {
  // Null means there is no valid sample on that side of the gap.
  from: number | null;
  to: number | null;
  fromSource: string | null;
  toSource: string | null;
  reasons: ChartBreakReason[];
}

export interface ChartLineSeries {
  segments: ChartCoordinate[][];
  breaks: ChartBreak[];
}

export function buildLineSeries(
  points: readonly ChartPoint[],
): ChartLineSeries {
  const ordered = points.map((point) => ({
    point,
    time: Date.parse(point.timestamp),
  }));

  // An invalid timestamp has no reliable position on the timeline.
  // Conservatively keep valid samples isolated in that case.
  const invalidTimestamp = ordered.some(
    ({ time }) => !Number.isFinite(time),
  );

  const sorted = ordered
    .filter(({ time }) => Number.isFinite(time))
    .sort((a, b) => a.time - b.time);

  const segments: ChartCoordinate[][] = [];
  const breaks: ChartBreak[] = [];
  let current: ChartCoordinate[] = [];
  let previous: (typeof sorted)[number] | null = null;
  const pending = new Set<ChartBreakReason>();

  function finishSegment() {
    if (current.length > 0) segments.push(current);
    current = [];
  }

  if (invalidTimestamp) {
    breaks.push({
      from: null,
      to: null,
      fromSource: null,
      toSource: null,
      reasons: ["invalid-timestamp"],
    });
  }

  for (const item of sorted) {
    const { point, time } = item;

    if (point.value === null || !Number.isFinite(point.value)) {
      finishSegment();
      pending.add("missing-value");
      continue;
    }

    const reasons = new Set(pending);

    if (previous !== null) {
      const earlier = previous.point;
      const interval = point.intervalMinutes;
      const previousInterval = earlier.intervalMinutes;

      if (point.source !== earlier.source) {
        reasons.add("source-change");
      }

      const knownInterval =
        interval !== null &&
        Number.isFinite(interval) &&
        interval > 0;

      const knownPreviousInterval =
        previousInterval !== null &&
        Number.isFinite(previousInterval) &&
        previousInterval > 0;

      if (!knownInterval || !knownPreviousInterval) {
        reasons.add("unknown-interval");
      } else if (interval !== previousInterval) {
        reasons.add("interval-change");
      } else if (time - previous.time > interval * 60_000) {
        reasons.add("missing-sample");
      }

      if (time === previous.time) {
        reasons.add("duplicate-timestamp");
      }
    }

    if (reasons.size > 0) {
      finishSegment();
      breaks.push({
        from: previous?.time ?? null,
        to: time,
        fromSource: previous?.point.source ?? null,
        toSource: point.source,
        reasons: [...reasons],
      });
    }

    pending.clear();

    if (invalidTimestamp) finishSegment();

    current.push({ time, value: point.value });
    previous = item;
  }

  finishSegment();

  // Preserve missing values after the final valid sample as well.
  if (pending.size > 0) {
    breaks.push({
      from: previous?.time ?? null,
      to: null,
      fromSource: previous?.point.source ?? null,
      toSource: null,
      reasons: [...pending],
    });
  }

  return { segments, breaks };
}

// Preserve the existing interface for callers that only need segments.
export function splitLineSegments(
  points: readonly ChartPoint[],
): ChartCoordinate[][] {
  return buildLineSeries(points).segments;
}


export interface ChartScale {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * Retain the default range and expand outward when values exceed it.
 * Use evenly spaced, readable ticks without clipping extreme values.
 */
export function createChartScale(
  values: readonly (number | null)[],
  defaultMin: number,
  defaultMax: number,
): ChartScale {
  if (
    !Number.isFinite(defaultMin) ||
    !Number.isFinite(defaultMax) ||
    defaultMin >= defaultMax
  ) {
    throw new RangeError("Expected a finite, increasing default range");
  }

  let lower = defaultMin;
  let upper = defaultMax;

  for (const value of values) {
    if (value !== null && Number.isFinite(value)) {
      lower = Math.min(lower, value);
      upper = Math.max(upper, value);
    }
  }

  // Aim for roughly four intervals using steps such as 1, 2, 5 or 10.
  const rawStep = (upper - lower) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const multiplier =
    normalized <= 1 ? 1 :
    normalized <= 2 ? 2 :
    normalized <= 5 ? 5 : 10;
  const step = multiplier * magnitude;

  const min = Math.floor(lower / step) * step;
  const max = Math.ceil(upper / step) * step;
  const count = Math.round((max - min) / step);

  const ticks = Array.from(
    { length: count + 1 },
    (_, index) => Number((min + index * step).toPrecision(12)),
  );

  return { min, max, ticks };
}