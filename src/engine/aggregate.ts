import { CATEGORIES } from "./categories";
import type {
  BottomUpRow,
  BucketGrid,
  BucketedLane,
  ColumnarLane,
  DiffGrid,
  DiffLane,
  NetworkRequestInfo,
  ParsedTraceModel,
  RhythmGrid,
} from "./types";

const CAT_COUNT = CATEGORIES.length;

export function exclusiveTimeInWindow(
  lane: ColumnarLane,
  index: number,
  t0: number,
  t1: number,
): number {
  let total = 0;
  const first = lane.exclusiveOffsets[index];
  const end = lane.exclusiveOffsets[index + 1];
  for (let i = first; i < end; i++) {
    total += Math.max(
      0,
      Math.min(lane.exclusiveEnds[i], t1) -
        Math.max(lane.exclusiveStarts[i], t0),
    );
  }
  return total;
}

/** Sum exact exclusive spans per bucket so parent/child work never overlaps. */
export function bucketize(
  lanes: ColumnarLane[],
  t0: number,
  t1: number,
  bucketCount: number,
): BucketGrid {
  const range = Math.max(1e-6, t1 - t0);
  const bucketMs = range / bucketCount;

  const result: BucketedLane[] = lanes.map((lane) => {
    const busy = new Float32Array(bucketCount);
    const perCat = new Float32Array(bucketCount * CAT_COUNT);
    const { starts, durs, catIds } = lane;

    const { lo, hi } = windowSlice(lane, t0, t1);
    for (let i = lo; i < hi; i++) {
      const start = starts[i];
      const end = start + durs[i];
      if (end <= t0 || start >= t1) continue;
      const cat = catIds[i];
      const intervalEnd = lane.exclusiveOffsets[i + 1];
      for (let interval = lane.exclusiveOffsets[i]; interval < intervalEnd; interval++) {
        const clampedStart = Math.max(lane.exclusiveStarts[interval], t0);
        const clampedEnd = Math.min(lane.exclusiveEnds[interval], t1);
        if (clampedEnd <= clampedStart) continue;
        const firstBucket = Math.min(
          bucketCount - 1,
          Math.floor((clampedStart - t0) / bucketMs),
        );
        const lastBucket = Math.min(
          bucketCount - 1,
          Math.floor((clampedEnd - t0 - 1e-9) / bucketMs),
        );
        for (let b = firstBucket; b <= lastBucket; b++) {
          const bStart = t0 + b * bucketMs;
          const bEnd = bStart + bucketMs;
          const overlap =
            Math.min(clampedEnd, bEnd) - Math.max(clampedStart, bStart);
          if (overlap <= 0) continue;
          busy[b] += overlap;
          perCat[b * CAT_COUNT + cat] += overlap;
        }
      }
    }

    const dominantCat = new Uint8Array(bucketCount);
    for (let b = 0; b < bucketCount; b++) {
      let best = 0;
      let bestVal = -1;
      for (let c = 0; c < CAT_COUNT; c++) {
        const v = perCat[b * CAT_COUNT + c];
        if (v > bestVal) {
          bestVal = v;
          best = c;
        }
      }
      dominantCat[b] = best;
    }
    return { laneId: lane.meta.id, busy, dominantCat, categoryTimes: perCat };
  });

  return { bucketMs, bucketCount, t0, t1, lanes: result };
}

/**
 * Aggregate self/total/count per event name inside [t0, t1]. Self uses exact
 * exclusive spans; total uses the clipped inclusive event duration.
 */
export function bottomUp(
  lanes: ColumnarLane[],
  t0: number,
  t1: number,
): BottomUpRow[] {
  const rows = new Map<number, BottomUpRow>();
  for (const lane of lanes) {
    const { starts, durs, nameIds, catIds } = lane;
    const { lo, hi } = windowSlice(lane, t0, t1);
    for (let i = lo; i < hi; i++) {
      const start = starts[i];
      const dur = durs[i];
      const end = start + dur;
      const frac =
        dur > 0
          ? (Math.min(end, t1) - Math.max(start, t0)) / dur
          : start >= t0
            ? 1
            : 0;
      if (frac <= 0) continue;
      const id = nameIds[i];
      let row = rows.get(id);
      if (!row) {
        row = { nameId: id, catId: catIds[i], self: 0, total: 0, count: 0 };
        rows.set(id, row);
      }
      row.self += exclusiveTimeInWindow(lane, i, t0, t1);
      row.total += dur * frac;
      row.count += 1;
    }
  }
  return [...rows.values()].sort((a, b) => b.self - a.self);
}

/**
 * Fold a lane's busy time into a (whole seconds) x (offset within second)
 * grid: FlameScope's subsecond layout. Periodic work aligns into ridges.
 */
export function rhythmFold(
  lane: ColumnarLane,
  rangeMs: number,
  cellMs = 10,
): RhythmGrid {
  if (!Number.isFinite(rangeMs) || rangeMs < 0 || !Number.isSafeInteger(Math.ceil(rangeMs))) throw new RangeError("Rhythm range must be finite and non-negative");
  if (!Number.isFinite(cellMs) || cellMs < 1 || !Number.isInteger(1000 / cellMs)) throw new RangeError("Rhythm cell size must divide one second exactly");
  const cellsPerSecond = Math.round(1000 / cellMs);
  const totalSeconds = Math.max(1, Math.ceil(rangeMs / 1000));
  const secondsPerColumn = Math.max(1, Math.ceil(totalSeconds / 256));
  const seconds = Math.ceil(totalSeconds / secondsPerColumn);
  const cells = new Float32Array(seconds * cellsPerSecond);
  const columnMs = secondsPerColumn * 1000;
  const { starts } = lane;
  const addPartialSecond = (start: number, end: number, column: number) => {
    const secondStart = Math.floor(start / 1000) * 1000;
    const first = Math.floor((start - secondStart) / cellMs);
    const last = Math.min(cellsPerSecond, Math.ceil((end - secondStart) / cellMs));
    for (let cell = first; cell < last; cell++) cells[column * cellsPerSecond + cell] += Math.max(0, Math.min(end, secondStart + (cell + 1) * cellMs) - Math.max(start, secondStart + cell * cellMs));
  };

  for (let i = 0; i < starts.length; i++) {
    const intervalEnd = lane.exclusiveOffsets[i + 1];
    for (let interval = lane.exclusiveOffsets[i]; interval < intervalEnd; interval++) {
      const end = Math.min(rangeMs, lane.exclusiveEnds[interval]);
      let cursor = Math.max(0, lane.exclusiveStarts[interval]);
      while (cursor < end) {
        const column = Math.min(seconds - 1, Math.floor(cursor / columnMs));
        const columnEnd = Math.min(end, (column + 1) * columnMs);
        const firstBoundary = Math.min(columnEnd, Math.ceil(cursor / 1000) * 1000);
        if (firstBoundary > cursor) {
          addPartialSecond(cursor, firstBoundary, column);
          cursor = firstBoundary;
        }
        const wholeSeconds = Math.floor((columnEnd - cursor) / 1000);
        if (wholeSeconds > 0) {
          for (let cell = 0; cell < cellsPerSecond; cell++) cells[column * cellsPerSecond + cell] += wholeSeconds * cellMs;
          cursor += wholeSeconds * 1000;
        }
        if (cursor < columnEnd) addPartialSecond(cursor, columnEnd, column);
        cursor = columnEnd;
      }
    }
  }

  let maxBusy = 0;
  for (const v of cells) if (v > maxBusy) maxBusy = v;
  return { cells, seconds, secondsPerColumn, cellsPerSecond, cellMs, maxBusy };
}

/**
 * Index range [lo, hi) of lane entries that can overlap [t0, t1]. Uses the
 * lane's maxDur to bound the look-back, so zoomed views cull in O(log n).
 */
export function windowSlice(
  lane: ColumnarLane,
  t0: number,
  t1: number,
): { lo: number; hi: number } {
  const { starts } = lane;
  const n = starts.length;
  const lowerBound = (value: number): number => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  // Events starting before t0 can still overlap if they run long enough.
  const lo = lowerBound(t0 - lane.meta.maxDur);
  const hi = lowerBound(t1);
  return { lo, hi };
}

export interface StallBand {
  start: number;
  end: number;
}

/**
 * Windows where the main thread is nearly idle while at least one
 * render-blocking request is still in flight: the page is waiting on the
 * network, not on the CPU.
 */
export function computeStalls(
  mainLane: ColumnarLane | undefined,
  requests: NetworkRequestInfo[],
  t0: number,
  t1: number,
  bucketMs = 4,
  minBandMs = 20,
): StallBand[] {
  if (!mainLane) return [];
  const blocking = requests.filter((r) => r.renderBlocking);
  if (blocking.length === 0) return [];

  const bucketCount = Math.max(1, Math.ceil((t1 - t0) / bucketMs));
  const grid = bucketize([mainLane], t0, t1, bucketCount);
  const busy = grid.lanes[0].busy;
  const idleThreshold = grid.bucketMs * 0.15;

  const inFlight = new Uint8Array(bucketCount);
  for (const request of blocking) {
    const first = Math.max(0, Math.floor((request.start - t0) / grid.bucketMs));
    const last = Math.min(
      bucketCount - 1,
      Math.floor((request.end - t0) / grid.bucketMs),
    );
    for (let b = first; b <= last; b++) inFlight[b] = 1;
  }

  const bands: StallBand[] = [];
  let bandStart = -1;
  for (let b = 0; b <= bucketCount; b++) {
    const stalled =
      b < bucketCount && inFlight[b] === 1 && busy[b] < idleThreshold;
    if (stalled && bandStart < 0) bandStart = b;
    if (!stalled && bandStart >= 0) {
      const start = t0 + bandStart * grid.bucketMs;
      const end = t0 + b * grid.bucketMs;
      if (end - start >= minBandMs) bands.push({ start, end });
      bandStart = -1;
    }
  }
  return bands;
}

/**
 * Diff two traces: bucket both aligned at their navigationStart markers and
 * subtract per matching lane name. Positive delta = B spent more (regression).
 */
export function diffTraces(
  a: ParsedTraceModel,
  b: ParsedTraceModel,
  bucketCount = 240,
): DiffGrid {
  const navA = a.markers.find((m) => m.name === "navigationStart")?.ts ?? 0;
  const navB = b.markers.find((m) => m.name === "navigationStart")?.ts ?? 0;
  const spanA = a.rangeMs - navA;
  const spanB = b.rangeMs - navB;
  const span = Math.max(1, Math.min(spanA, spanB));
  const bucketMs = span / bucketCount;

  const laneKey = (name: string): string => name.split(" — ")[0];
  const gridA = bucketize(a.lanes, navA, navA + span, bucketCount);
  const gridB = bucketize(b.lanes, navB, navB + span, bucketCount);

  const byKeyB = new Map<string, Float32Array>();
  for (const lane of gridB.lanes) {
    const key = laneKey(b.lanes[lane.laneId].meta.name);
    if (!byKeyB.has(key)) byKeyB.set(key, lane.busy);
  }

  const lanes: DiffLane[] = [];
  let maxAbsDelta = 0;
  const seen = new Set<string>();
  for (const lane of gridA.lanes) {
    const key = laneKey(a.lanes[lane.laneId].meta.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const busyB = byKeyB.get(key);
    if (!busyB) continue;
    const delta = new Float32Array(bucketCount);
    for (let i = 0; i < bucketCount; i++) {
      delta[i] = busyB[i] - lane.busy[i];
      const abs = Math.abs(delta[i]);
      if (abs > maxAbsDelta) maxAbsDelta = abs;
    }
    lanes.push({ name: key, delta });
  }

  return { bucketMs, bucketCount, lanes, maxAbsDelta };
}
