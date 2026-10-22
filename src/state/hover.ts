import type { WorldBounds } from "../scene/cameraActions";
import type { ReviewedDefinition } from "../evidence/definitions";

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
  definition?: Pick<ReviewedDefinition, "text" | "source"> | null;
}

export type HoverInfo = HoverPosition & (
  | { source: "canyon"; lane: number; summary?: HoverSummary }
  | { source: "terrain" | "city" | "rhythm" | "diff" | "regression" | "system" | "connection"; summary: HoverSummary }
);
