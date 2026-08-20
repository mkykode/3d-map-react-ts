import { describe, expect, it } from "vitest";
import { summarizeWebVitals } from "./vitals";
import type { VitalMarker } from "./types";

const marker = (name: string, ts: number): VitalMarker => ({
  name,
  label: name,
  ts,
});

describe("summarizeWebVitals", () => {
  it("scopes trace markers to navigation and reports unsupported metrics", () => {
    const summary = summarizeWebVitals([
      marker("navigationStart", 10),
      marker("firstContentfulPaint", 40),
      marker("largestContentfulPaint::Candidate", 80),
      marker("largestContentfulPaint::Candidate", 100),
      marker("MarkDOMContent", 110),
      marker("MarkLoad", 130),
    ]);

    expect(summary.navigationStart).toBe(10);
    expect(summary.criticalWindow).toEqual([10, 100]);
    expect(summary.metrics.lcp).toMatchObject({
      available: true,
      valueMs: 90,
      markerTs: 100,
    });
    expect(summary.metrics.fcp).toMatchObject({ available: true, valueMs: 30 });
    expect(summary.metrics.cls).toMatchObject({
      available: false,
      reason: "Layout-shift clusters are not modeled yet.",
    });
    expect(summary.metrics.inp).toMatchObject({
      available: false,
      reason: "Interaction timing is not modeled yet.",
    });
  });

  it("does not invent values when navigation evidence is missing", () => {
    const summary = summarizeWebVitals([]);
    expect(summary.navigationStart).toBeNull();
    expect(summary.criticalWindow).toBeNull();
    expect(summary.metrics.lcp.available).toBe(false);
    expect(summary.metrics.fcp.available).toBe(false);
  });
});
