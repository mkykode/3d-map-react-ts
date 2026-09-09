import type { ParsedTraceModel } from "../engine/types";
import type { ViewId } from "../state/store";
import type { CameraActionPreset, WorldBounds } from "./cameraActions";
import { CITY_H, LANE_GAP, RHYTHM_H, TIME_W } from "./layout";
import { traceLayout } from "./traceLayout";

export const CITY_SIZE = 70;
export const CITY_X = 45;
export const RHYTHM_CELL_MS = 10;
/** Terrain's screenshot filmstrip sits in front of the first lane; fit bounds must include it. */
export const TERRAIN_STRIP_Z = -8;
export function rhythmLayout(rangeMs: number) {
  const totalSeconds = Math.max(1, Math.ceil(rangeMs / 1000));
  const secondsPerColumn = Math.max(1, Math.ceil(totalSeconds / 256));
  const seconds = Math.ceil(totalSeconds / secondsPerColumn);
  const colW = Math.max(0.1, Math.min(20, TIME_W / seconds));
  const cellD = 0.6;
  const width = seconds * colW;
  const depth = 100 * cellD;
  const x = (TIME_W - width) / 2;
  return { seconds, secondsPerColumn, colW, cellD, width, depth, x };
}

export function sceneBounds(model: ParsedTraceModel | null, view: ViewId, hidden: Set<number>, preset: CameraActionPreset): WorldBounds {
  if (view === "city") return { min: [CITY_X, 0, 0], max: [CITY_X + CITY_SIZE, CITY_H + 3, CITY_SIZE] };
  if (view === "rhythm") {
    const grid = rhythmLayout(model?.rangeMs ?? 1000);
    return { min: [grid.x, 0, 0], max: [grid.x + grid.width, RHYTHM_H + 3, grid.depth] };
  }
  const lanes = model?.lanes.filter((l) => !hidden.has(l.meta.id)) ?? [];
  if (view === "canyon") return traceLayout(lanes, preset).bounds;
  return { min: [0, 0, TERRAIN_STRIP_Z - 1], max: [TIME_W, 22, Math.max(7, lanes.length * LANE_GAP)] };
}
