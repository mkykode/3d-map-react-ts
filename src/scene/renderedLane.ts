import type { ColumnarLane } from "../engine/types";
import type { EventSpan } from "./canyonLod";
import { buildPickIndex } from "./picking";

/** Picking indexes the displayed LOD, not hidden subpixel source events. */
export function indexRenderedLane(source: ColumnarLane, spans: EventSpan[]) {
  const geometry: ColumnarLane = {
    ...source,
    starts: Float64Array.from(spans.map((s) => s.start)),
    durs: Float64Array.from(spans.map((s) => s.end - s.start)),
    depths: Uint16Array.from(spans.map((s) => s.depth)),
    selfTimes: Float64Array.from(spans.map((s) => s.duration > 0 ? (s.end - s.start) * s.self / s.duration : 0)),
  };
  return { geometry, index: buildPickIndex(geometry), spans };
}

export type RenderedLane = ReturnType<typeof indexRenderedLane>;
