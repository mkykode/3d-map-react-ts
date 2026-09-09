import type { ColumnarLane } from "../engine/types";
import type { CameraActionPreset, WorldBounds } from "./cameraActions";
import { BOX_H, LANE_D, LANE_GAP, TIME_W } from "./layout";

export const TOP_ROW_D = 0.8;
export const STACK_GAP = 4;

export interface LanePlacement {
  lane: ColumnarLane;
  y: number;
  z: number;
  top: boolean;
  height: number;
  depth: number;
  levelH: number;
}

/** The same coordinates drive the visible boxes, ray index and camera fit. */
export function traceLayout(lanes: ColumnarLane[], preset: CameraActionPreset) {
  const maxDepth = Math.max(1, ...lanes.map((l) => l.meta.maxDepth));
  const levelH = BOX_H * Math.min(1, 40 / maxDepth);
  let row = 0;
  let elevation = 0;
  const placements: LanePlacement[] = lanes.map((lane, index) => {
    const levels = lane.meta.maxDepth + 1;
    const top = preset === "top";
    const height = top ? BOX_H : levels * levelH;
    const depth = top ? levels * TOP_ROW_D * levelH / BOX_H : LANE_D;
    const y = preset === "side" ? elevation : 0;
    const z = top ? row : preset === "side" ? 0 : (lanes.length - 1 - index) * LANE_GAP;
    row += depth + STACK_GAP;
    elevation += height + STACK_GAP;
    return { lane, y, z, top, height, depth, levelH };
  });
  const bounds: WorldBounds = {
    min: [0, 0, preset === "top" ? 0 : -LANE_D / 2],
    max: [TIME_W, Math.max(BOX_H, ...placements.map((p) => p.y + p.height)),
      Math.max(LANE_D / 2, ...placements.map((p) => p.z + (p.top ? p.depth : LANE_D / 2)))],
  };
  return { placements, bounds };
}

export function eventCrossSection(lane: ColumnarLane, idx: number, top: boolean, levelH = BOX_H) {
  const share = lane.durs[idx] > 0 ? Math.min(1, Math.max(0, lane.selfTimes[idx] / lane.durs[idx])) : 0;
  return {
    y: top ? BOX_H / 2 : (lane.depths[idx] + 0.5) * levelH,
    z: top ? (lane.depths[idx] + 0.5) * TOP_ROW_D * levelH / BOX_H : 0,
    h: (top ? BOX_H : levelH) * 0.9,
    d: top ? TOP_ROW_D * levelH / BOX_H * 0.9 : LANE_D * (0.18 + 0.72 * share),
  };
}

export function eventBounds(placement: LanePlacement, idx: number, t0: number, t1: number): WorldBounds | null {
  const lane = placement.lane;
  if (idx < 0 || idx >= lane.starts.length || t1 <= t0) return null;
  const start = Math.max(t0, lane.starts[idx]);
  const end = Math.min(t1, lane.starts[idx] + lane.durs[idx]);
  if (end <= start) return null;
  const cross = eventCrossSection(lane, idx, placement.top, placement.levelH);
  return {
    min: [(start - t0) / (t1 - t0) * TIME_W, placement.y + cross.y - cross.h / 2, placement.z + cross.z - cross.d / 2],
    max: [(end - t0) / (t1 - t0) * TIME_W, placement.y + cross.y + cross.h / 2, placement.z + cross.z + cross.d / 2],
  };
}
