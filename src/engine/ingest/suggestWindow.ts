import { STREAM_LIMITS } from "./budget.ts";
import type { TraceOverview, TraceWindow } from "./types.ts";

/** Start on activity; leave budget headroom for profiles and boundary context. */
export function suggestTraceWindow(overview: TraceOverview): TraceWindow {
  const { counts, bucketWidthUs, bucketStartUs, startUs, endUs } = overview;
  const width = Math.min(10_000_000, endUs - startUs);
  const bucketCount = Math.max(1, Math.ceil(width / bucketWidthUs));
  let sum = 0;
  let best = -1;
  let bestIndex = 0;
  for (let i = 0; i < counts.length; i++) {
    sum += counts[i];
    if (i >= bucketCount) sum -= counts[i - bucketCount];
    if (sum > best) { best = sum; bestIndex = Math.max(0, i - bucketCount + 1); }
  }
  let start = Math.max(startUs, Math.min(endUs - width, bucketStartUs + bestIndex * bucketWidthUs));
  let end = Math.min(endUs, start + width);
  const averageBytes = overview.retainedBytes / Math.max(1, overview.retainedEventCount);
  const targetEvents = Math.min(STREAM_LIMITS.retainedEvents, STREAM_LIMITS.retainedBytes / Math.max(1, averageBytes)) * 0.65;
  const density = (from: number, to: number) => counts.reduce((total, count, index) => {
    const left = bucketStartUs + index * bucketWidthUs;
    return total + (left < to && left + bucketWidthUs > from ? count : 0);
  }, 0);
  while (end - start > Math.max(100_000, bucketWidthUs) && density(start, end) > targetEvents) {
    const middle = (start + end) / 2;
    if (density(start, middle) >= density(middle, end)) end = middle;
    else start = middle;
  }
  return [start, end];
}
