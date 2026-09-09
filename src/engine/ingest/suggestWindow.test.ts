import { expect, it } from "vitest";
import { suggestTraceWindow } from "./suggestWindow";
import type { TraceOverview } from "./types";

it("selects activity after a long quiet gap and shrinks dense intervals", () => {
  const overview: TraceOverview = { startUs: 1_000_000, endUs: 181_000_000, bucketStartUs: 1_000_000, bucketWidthUs: 1_000_000, counts: Array.from({ length: 180 }, (_, i) => i >= 160 ? 100_000 : 0), eventCount: 2_000_000, retainedEventCount: 2_000_000, retainedBytes: 800_000_000, decompressedBytes: 1_200_000_000 };
  const window = suggestTraceWindow(overview);
  expect(window[0]).toBeGreaterThanOrEqual(161_000_000);
  expect(window[1] - window[0]).toBeLessThan(10_000_000);
  expect(window[1]).toBeLessThanOrEqual(overview.endUs);
});

it("keeps a short recording's complete interval", () => {
  expect(suggestTraceWindow({ startUs: 500, endUs: 1500, bucketStartUs: 0, bucketWidthUs: 100_000, counts: [1], eventCount: 1, retainedEventCount: 1, retainedBytes: 100, decompressedBytes: 100 })).toEqual([500, 1500]);
});
