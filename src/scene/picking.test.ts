import { describe, expect, it } from "vitest";
import { Box3, Ray, Vector3 } from "three";
import type { ColumnarLane } from "../engine/types";
import { buildPickIndex, pickLaneRay } from "./picking";
import { eventBounds, traceLayout } from "./traceLayout";

const lane = {
  meta: { id: 0, kind: "main", maxDepth: 160, maxDur: 100 },
  starts: new Float64Array([0, 10, 20, 45, 60]),
  durs: new Float64Array([100, 20, 5, 10, 20]),
  depths: new Uint16Array([0, 1, 2, 1, 160]),
  selfTimes: new Float64Array([40, 15, 5, 10, 20]),
} as ColumnarLane;

describe("indexed canyon rays", () => {
  it.each(["orbit", "top", "side"] as const)("matches actual boxes from every direction in %s", (preset) => {
    const placement = traceLayout([lane], preset).placements[0];
    const index = buildPickIndex(lane);
    for (let i = 0; i < lane.starts.length; i++) {
      const bounds = eventBounds(placement, i, 0, 100)!;
      const center = new Vector3(...bounds.min).add(new Vector3(...bounds.max)).multiplyScalar(0.5);
      for (const offset of [[0, 200, 0], [0, 0, 200], [0, 0, -200], [-200, 60, 100], [200, 120, -100]]) {
        const origin = center.clone().add(new Vector3(...offset));
        const ray = new Ray(origin, center.clone().sub(origin).normalize());
        let expected: { idx: number; distance: number } | null = null;
        for (let j = 0; j < lane.starts.length; j++) {
          const b = eventBounds(placement, j, 0, 100)!;
          const hit = ray.intersectBox(new Box3(new Vector3(...b.min), new Vector3(...b.max)), new Vector3());
          if (hit && (!expected || hit.distanceTo(origin) < expected.distance)) expected = { idx: j, distance: hit.distanceTo(origin) };
        }
        const actual = pickLaneRay(lane, index, ray, placement.top, 0, 100, placement.levelH);
        expect(actual?.idx).toBe(expected?.idx);
        expect(actual?.distance).toBeCloseTo(expected!.distance, 5);
      }
    }
  });

  it("does not fill temporal gaps or select outside a zoomed window", () => {
    const index = buildPickIndex(lane);
    expect(pickLaneRay(lane, index, new Ray(new Vector3(64, 20, 1.2), new Vector3(0, -1, 0)), true, 0, 100)).toBeNull();
    expect(pickLaneRay(lane, index, new Ray(new Vector3(-1, 200, 0), new Vector3(0, -1, 0)), false, 40, 60)).toBeNull();
  });
});
