import * as THREE from "three";
import { CATEGORIES } from "../engine/categories";

/** World-space layout shared by every view. Time always runs along +X. */
export const TIME_W = 160;
export const LANE_GAP = 7;
export const LANE_D = 5;
export const BOX_H = 0.6;
export const TERRAIN_H = 10;
export const CITY_H = 14;
export const RHYTHM_H = 8;

export const INK = "#f5f5f7";
export const INK_SECONDARY = "#c3c2b7";
export const INK_MUTED = "#8a8f98";
export const SURFACE = "#131418";
export const GROUND = "#101216";
export const GRID_LINE = "#2a2e35";

export const xOf = (ms: number, rangeMs: number): number =>
  (ms / rangeMs) * TIME_W;

export const msOf = (x: number, rangeMs: number): number =>
  (x / TIME_W) * rangeMs;

export function scaleHeight(
  value: number,
  max: number,
  height: number,
  mode: "linear" | "log",
): number {
  if (max <= 0 || value <= 0) return 0;
  if (mode === "log") {
    return (Math.log1p(value) / Math.log1p(max)) * height;
  }
  return (value / max) * height;
}

/** 1-2-5 tick step covering roughly `target` divisions. */
export function niceTickStep(rangeMs: number, target = 8): number {
  if (!Number.isFinite(rangeMs) || rangeMs <= 0) return 1;
  const raw = rangeMs / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const mult of [1, 2, 5, 10]) {
    if (raw <= mult * pow) return mult * pow;
  }
  return 10 * pow;
}

export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s`;
  if (ms >= 1) return `${ms.toFixed(ms >= 100 ? 0 : 1)} ms`;
  return `${(ms * 1000).toFixed(0)} µs`;
}

export const CAT_COLORS: THREE.Color[] = CATEGORIES.map(
  (c) => new THREE.Color(c.color),
);
export const DIM_TARGET = new THREE.Color(SURFACE);
