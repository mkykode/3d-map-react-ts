import type { ColumnarLane } from "../engine/types";

/**
 * Analytical picking: the canyon layout is axis-aligned, so instead of
 * raycasting half a million boxes we binary-search the columnar data at the
 * (time, depth) the pointer hit on a lane's hitbox.
 */
export interface LanePickIndex {
  /** Per depth: entry indices sorted by start time (inherited order). */
  byDepth: { starts: Float64Array; indices: Int32Array }[];
}

export function buildPickIndex(lane: ColumnarLane): LanePickIndex {
  const buckets: number[][] = [];
  for (let i = 0; i < lane.depths.length; i++) {
    const d = lane.depths[i];
    (buckets[d] ??= []).push(i);
  }
  return {
    byDepth: buckets.map((indices) => {
      const idx = Int32Array.from(indices ?? []);
      const starts = new Float64Array(idx.length);
      for (let i = 0; i < idx.length; i++) starts[i] = lane.starts[idx[i]];
      return { starts, indices: idx };
    }),
  };
}

/**
 * Find the entry at `timeMs` and `depth` in a lane, tolerating the visual
 * minimum box width `minWidthMs` so slivers stay hoverable.
 */
export function pickEntry(
  lane: ColumnarLane,
  index: LanePickIndex,
  timeMs: number,
  depth: number,
  minWidthMs: number,
): number | null {
  const level = index.byDepth[depth];
  if (!level || level.indices.length === 0) return null;

  // Rightmost start <= timeMs.
  let lo = 0;
  let hi = level.starts.length - 1;
  let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (level.starts[mid] <= timeMs) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (candidate < 0) return null;
  const entry = level.indices[candidate];
  const width = Math.max(lane.durs[entry], minWidthMs);
  return lane.starts[entry] + width >= timeMs ? entry : null;
}
