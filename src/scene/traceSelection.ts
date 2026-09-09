import type { ParsedTraceModel } from "../engine/types";
import { MS_PER_SECOND } from "../engine/rhythmLayout";
import type { TraceSelection, WorldBounds } from "./cameraActions";
import { LANE_D, LANE_GAP, RHYTHM_H, TERRAIN_H, TIME_W } from "./layout";
import { rhythmLayout } from "./sceneBounds";

export function selectionNameId(model: ParsedTraceModel, selection: TraceSelection | null): number | null {
  if (!selection) return null;
  if (selection.kind === "name") return selection.nameId;
  const lane = model.lanes.find((l) => l.meta.id === selection.lane);
  return lane?.nameIds[selection.idx] ?? null;
}

/** A range annotation for aggregate views, not a claim of per-call geometry. */
export function aggregateSelectionBounds(model: ParsedTraceModel, selection: TraceSelection | null, hidden: Set<number>, view: "terrain" | "rhythm", window: readonly [number, number]): WorldBounds | null {
  if (!selection || window[1] <= window[0]) return null;
  const lanes = model.lanes.filter((lane) => !hidden.has(lane.meta.id));
  const rhythmLane = lanes.find((lane) => lane.meta.kind === "main") ?? lanes[0];
  const displayed = view === "rhythm" ? lanes.filter((lane) => lane === rhythmLane) : lanes.reverse();
  const grid = rhythmLayout(model.rangeMs);
  const min: [number, number, number] = [Infinity, 0, Infinity];
  const max: [number, number, number] = [-Infinity, view === "rhythm" ? RHYTHM_H : TERRAIN_H, -Infinity];
  displayed.forEach((lane, laneIndex) => {
    if (selection.kind === "entry" && selection.lane !== lane.meta.id) return;
    const first = selection.kind === "entry" ? selection.idx : 0;
    const last = selection.kind === "entry" ? selection.idx + 1 : lane.starts.length;
    for (let i = first; i < last; i++) {
      if (selection.kind === "name" && lane.nameIds[i] !== selection.nameId) continue;
      const start = Math.max(window[0], lane.starts[i]), end = Math.min(window[1], lane.starts[i] + lane.durs[i]);
      if (!(end > start)) continue;
      let x0: number, x1: number, z0: number, z1: number;
      if (view === "terrain") {
        x0 = (start - window[0]) / (window[1] - window[0]) * TIME_W;
        x1 = (end - window[0]) / (window[1] - window[0]) * TIME_W;
        z0 = laneIndex * LANE_GAP - LANE_D / 2;
        z1 = laneIndex * LANE_GAP + LANE_D / 2;
      } else {
        const firstSecond = Math.floor(start / MS_PER_SECOND), lastSecond = Math.ceil(end / MS_PER_SECOND) - 1;
        x0 = grid.x + Math.floor(firstSecond / grid.secondsPerColumn) * grid.colW;
        x1 = grid.x + (Math.floor(lastSecond / grid.secondsPerColumn) + 1) * grid.colW;
        z0 = firstSecond === lastSecond ? Math.floor((start % MS_PER_SECOND) / grid.cellMs) * grid.cellD : 0;
        z1 = firstSecond === lastSecond ? Math.ceil((end - firstSecond * MS_PER_SECOND) / grid.cellMs) * grid.cellD : grid.depth;
      }
      min[0] = Math.min(min[0], x0); min[2] = Math.min(min[2], z0);
      max[0] = Math.max(max[0], x1); max[2] = Math.max(max[2], z1);
    }
  });
  return Number.isFinite(min[0]) ? { min, max } : null;
}
