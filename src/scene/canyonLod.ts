import type { ColumnarLane } from "../engine/types";
import { lowerBound, type LanePickIndex } from "./picking";

export interface EventSpan {
  start: number;
  end: number;
  depth: number;
  catId: number;
  nameId: number;
  entry: number;
  count: number;
  self: number;
  duration: number;
  status: number;
}

export function isVisibleSpan(span: EventSpan, pixelMs: number) {
  return span.status > 0 || span.end - span.start >= pixelMs * 0.5;
}

/** Fixed-pixel selection annotations, never inflated duration geometry. */
export function tinySelectionSpans(spans: EventSpan[], pixelMs: number, limit = 128) {
  const tiny = spans.filter((span) => !isVisibleSpan(span, pixelMs));
  const stride = Math.max(1, Math.ceil(tiny.length / limit));
  return tiny.filter((_, i) => i % stride === 0);
}

/** Merge only subpixel neighbours in the same row and screen-sized time bin. */
export function canyonSpans(lane: ColumnarLane, index: LanePickIndex, t0: number, t1: number, pixelMs: number, flags?: Uint8Array): EventSpan[] {
  const spans: EventSpan[] = [];
  const threshold = pixelMs * 2;
  for (const level of index.byDepth) {
    if (!level) continue;
    let pending: EventSpan | null = null;
    let categoryWeights = new Map<number, number>();
    const flush = () => {
      if (pending && pending.end > pending.start) spans.push(pending);
      pending = null;
      categoryWeights = new Map();
    };
    const first = lowerBound(level.ends, t0);
    const last = lowerBound(level.starts, t1);
    for (let j = first; j < last; j++) {
      const idx = level.indices[j];
      const start = Math.max(t0, lane.starts[idx]);
      const end = Math.min(t1, lane.starts[idx] + lane.durs[idx]);
      if (end <= start) continue;
      const tiny = end - start < threshold;
      if (!tiny || (pending && (start - pending.end > pixelMs || Math.floor((start - t0) / threshold) !== Math.floor((pending.start - t0) / threshold)))) flush();
      if (!pending) {
        pending = { start, end, depth: lane.depths[idx], catId: lane.catIds[idx], nameId: lane.nameIds[idx], entry: idx, count: 1,
          self: lane.selfTimes[idx], duration: lane.durs[idx], status: flags?.[idx] ?? 0 };
        categoryWeights.set(pending.catId, end - start);
      } else {
        pending.end = Math.max(pending.end, end);
        pending.count++;
        pending.self += lane.selfTimes[idx];
        pending.duration += lane.durs[idx];
        pending.status = Math.max(pending.status, flags?.[idx] ?? 0);
        if (pending.nameId !== lane.nameIds[idx]) pending.nameId = -1;
        const cat = lane.catIds[idx];
        const weight = (categoryWeights.get(cat) ?? 0) + end - start;
        categoryWeights.set(cat, weight);
        if (weight > (categoryWeights.get(pending.catId) ?? 0)) pending.catId = cat;
      }
      if (!tiny) flush();
    }
    flush();
  }
  return spans;
}
