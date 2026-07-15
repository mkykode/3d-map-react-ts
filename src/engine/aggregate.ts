import { CATEGORIES } from "./categories";
import type {
  BottomUpRow,
  BucketGrid,
  BucketedLane,
  ColumnarLane,
  DiffGrid,
  DiffLane,
  ParsedTraceModel,
  RhythmGrid,
} from "./types";

const CAT_COUNT = CATEGORIES.length;

/**
 * Sum self-time per bucket per lane, attributing each event's self time
 * linearly across the buckets its span covers. Self-time attribution keeps
 * parent/child work from double counting.
 */
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
    const { starts, durs, selfTimes, catIds } = lane;

    for (let i = 0; i < starts.length; i++) {
      const start = starts[i];
      const end = start + durs[i];
      if (end <= t0 || start >= t1) continue;
      const self = selfTimes[i];
      if (self <= 0) continue;

      const clampedStart = Math.max(start, t0);
      const clampedEnd = Math.min(Math.max(end, start + 1e-6), t1);
      const span = Math.max(end - start, 1e-6);
      // self time per ms of span, spread across covered buckets
      const density = (self * (clampedEnd - clampedStart)) / span;

      const firstBucket = Math.min(
        bucketCount - 1,
        Math.floor((clampedStart - t0) / bucketMs),
      );
      const lastBucket = Math.min(
        bucketCount - 1,
        Math.floor((clampedEnd - t0 - 1e-9) / bucketMs),
      );
      const cat = catIds[i];

      if (firstBucket === lastBucket) {
        busy[firstBucket] += density;
        perCat[firstBucket * CAT_COUNT + cat] += density;
      } else {
        const covered = clampedEnd - clampedStart;
        for (let b = firstBucket; b <= lastBucket; b++) {
          const bStart = t0 + b * bucketMs;
          const bEnd = bStart + bucketMs;
          const overlap =
            Math.min(clampedEnd, bEnd) - Math.max(clampedStart, bStart);
          if (overlap <= 0) continue;
          const share = (density * overlap) / covered;
          busy[b] += share;
          perCat[b * CAT_COUNT + cat] += share;
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
    return { laneId: lane.meta.id, busy, dominantCat };
  });

  return { bucketMs, bucketCount, t0, t1, lanes: result };
}

/**
 * Aggregate self/total/count per event name inside [t0, t1]. Events cut by a
 * window edge contribute only their overlapping share, so a narrow brush
 * inside a long task reports the windowed cost, not the whole task.
 */
export function bottomUp(
  lanes: ColumnarLane[],
  t0: number,
  t1: number,
): BottomUpRow[] {
  const rows = new Map<number, BottomUpRow>();
  for (const lane of lanes) {
    const { starts, durs, selfTimes, nameIds, catIds } = lane;
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i];
      if (start >= t1) break;
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
      row.self += selfTimes[i] * frac;
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
  const cellsPerSecond = Math.round(1000 / cellMs);
  const seconds = Math.max(1, Math.ceil(rangeMs / 1000));
  const cells = new Float32Array(seconds * cellsPerSecond);
  const { starts, durs, selfTimes } = lane;

  for (let i = 0; i < starts.length; i++) {
    const self = selfTimes[i];
    if (self <= 0) continue;
    const start = starts[i];
    const end = start + Math.max(durs[i], 1e-6);
    const density = self / (end - start);
    // Walk the span in cell-sized steps, attributing density per overlap.
    let cursor = start;
    while (cursor < end) {
      const cellIndex = Math.floor(cursor / cellMs);
      const cellEnd = (cellIndex + 1) * cellMs;
      const overlap = Math.min(end, cellEnd) - cursor;
      const second = Math.floor((cellIndex * cellMs) / 1000);
      const offsetCell = cellIndex % cellsPerSecond;
      if (second < seconds) {
        cells[second * cellsPerSecond + offsetCell] += density * overlap;
      }
      cursor = cellEnd;
    }
  }

  let maxBusy = 0;
  for (const v of cells) if (v > maxBusy) maxBusy = v;
  return { cells, seconds, cellsPerSecond, cellMs, maxBusy };
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
