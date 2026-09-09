import type { WorldBounds } from "../scene/cameraActions";

interface HoverPosition {
  idx: number;
  clientX: number;
  clientY: number;
  bounds?: WorldBounds;
}

interface HoverSummary {
  title: string;
  detail: string;
  catId: number;
}

export type HoverInfo = HoverPosition & (
  | { source: "canyon"; lane: number; summary?: HoverSummary }
  | { source: "terrain" | "city" | "rhythm" | "diff" | "regression"; summary: HoverSummary }
);
