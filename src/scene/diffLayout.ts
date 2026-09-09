import type { FindingProjectionMark } from "../engine/findingContract";
import type { WorldBounds } from "./cameraActions";
import { LANE_D, LANE_GAP } from "./layout";

export const DIFF_MARK_W = 6;
export const DIFF_MARK_H = 10;
export const DIFF_ZERO_Y = 5;

export function diffMarkBounds(mark: FindingProjectionMark, domains: readonly string[]): WorldBounds {
  const height = 0.75 + mark.magnitudeRatio * DIFF_MARK_H;
  const below = mark.status === "improvement" || mark.status === "removed";
  const x = mark.domainRank * (DIFF_MARK_W + 2);
  const z = Math.max(0, domains.indexOf(mark.domain)) * LANE_GAP;
  return { min: [x, below ? DIFF_ZERO_Y - height : DIFF_ZERO_Y, z - LANE_D * 0.44], max: [x + DIFF_MARK_W, below ? DIFF_ZERO_Y : DIFF_ZERO_Y + height, z + LANE_D * 0.44] };
}

export function diffProjectionBounds(marks: readonly FindingProjectionMark[]): WorldBounds {
  const domains = [...new Set(marks.map((m) => m.domain))];
  const boxes = marks.map((m) => diffMarkBounds(m, domains));
  return { min: [0, Math.min(0, ...boxes.map((b) => b.min[1])), -LANE_D / 2], max: [Math.max(48, ...boxes.map((b) => b.max[0])), Math.max(DIFF_ZERO_Y, ...boxes.map((b) => b.max[1])), Math.max(LANE_GAP, domains.length * LANE_GAP)] };
}
