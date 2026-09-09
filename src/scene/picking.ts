import type { ColumnarLane } from "../engine/types";
import { Ray, Vector3 } from "three";
import { BOX_H, LANE_D, TIME_W } from "./layout";
import { eventCrossSection, TOP_ROW_D } from "./traceLayout";

/**
 * Analytical picking: the canyon layout is axis-aligned, so instead of
 * raycasting half a million boxes we binary-search the columnar data at the
 * (time, depth) the pointer hit on a lane's hitbox.
 */
export interface LanePickIndex {
  /** Per depth: entry indices sorted by start time (inherited order). */
  byDepth: { starts: Float64Array; indices: Int32Array; ends: Float64Array }[];
}

export function buildPickIndex(lane: ColumnarLane, entries: Iterable<number> = lane.depths.keys()): LanePickIndex {
  const buckets: number[][] = [];
  for (const i of entries) {
    const d = lane.depths[i];
    (buckets[d] ??= []).push(i);
  }
  return {
    byDepth: buckets.map((indices) => {
      const idx = Int32Array.from(indices ?? []);
      const starts = new Float64Array(idx.length);
      const ends = new Float64Array(idx.length);
      for (let i = 0; i < idx.length; i++) {
        starts[i] = lane.starts[idx[i]];
        ends[i] = Math.max(i ? ends[i - 1] : -Infinity, starts[i] + lane.durs[idx[i]]);
      }
      return { starts, indices: idx, ends };
    }),
  };
}

export function lowerBound(values: Float64Array, value: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Slab test returns the traversed ray interval, including rays parallel to a face. */
function interval(ray: Ray, min: readonly number[], max: readonly number[]): [number, number] | null {
  let near = 0;
  let far = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const origin = ray.origin.getComponent(axis);
    const direction = ray.direction.getComponent(axis);
    if (Math.abs(direction) < 1e-12) {
      if (origin < min[axis] || origin > max[axis]) return null;
    } else {
      const a = (min[axis] - origin) / direction;
      const b = (max[axis] - origin) / direction;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (far < near) return null;
    }
  }
  return [near, far];
}

/** Exact intersections, O(depth × log(events per depth) + crossed intervals). */
export function pickLaneRay(lane: ColumnarLane, index: LanePickIndex, ray: Ray, top: boolean, t0: number, t1: number, levelH = BOX_H) {
  if (t1 <= t0) return null;
  let nearest: { idx: number; distance: number; point: Vector3 } | null = null;
  const rowD = TOP_ROW_D * levelH / BOX_H;
  for (let depth = 0; depth < index.byDepth.length; depth++) {
    const level = index.byDepth[depth];
    if (!level?.indices.length) continue;
    const y0 = top ? 0 : depth * levelH;
    const z0 = top ? depth * rowD : -LANE_D / 2;
    const slab = interval(ray, [0, y0, z0], [TIME_W, y0 + (top ? BOX_H : levelH), z0 + (top ? rowD : LANE_D)]);
    if (!slab || (nearest && slab[0] > nearest.distance)) continue;
    const a = ray.origin.x + ray.direction.x * slab[0];
    const b = ray.origin.x + ray.direction.x * slab[1];
    const from = t0 + Math.min(a, b) / TIME_W * (t1 - t0);
    const to = t0 + Math.max(a, b) / TIME_W * (t1 - t0);
    for (let j = lowerBound(level.ends, from); j < level.indices.length && level.starts[j] <= to; j++) {
      const idx = level.indices[j];
      const start = Math.max(t0, lane.starts[idx]);
      const end = Math.min(t1, lane.starts[idx] + lane.durs[idx]);
      if (end <= start) continue;
      const cross = eventCrossSection(lane, idx, top, levelH);
      const hit = interval(ray,
        [(start - t0) / (t1 - t0) * TIME_W, cross.y - cross.h / 2, cross.z - cross.d / 2],
        [(end - t0) / (t1 - t0) * TIME_W, cross.y + cross.h / 2, cross.z + cross.d / 2]);
      if (hit && (!nearest || hit[0] < nearest.distance)) {
        nearest = { idx, distance: hit[0], point: ray.at(hit[0], new Vector3()) };
      }
    }
  }
  return nearest;
}
