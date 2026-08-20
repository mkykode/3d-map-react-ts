import { describe, expect, test } from "vitest";
import { findingId } from "../domain/analysis";
import { evidenceIdentity } from "../domain/evidence";
import type { RegressionMark } from "../engine/findingContract";
import {
  regressionMarkAtInstance,
  regressionMarkBounds,
  regressionProjectionBounds,
} from "./regressionPicking";

describe("bounded regression picking", () => {
  test("maps an instanced hit to one stable mark without per-mark geometry", () => {
    const marks = [mark("cpu", 0), mark("request", 12)];

    expect(regressionMarkAtInstance(marks, 1)).toBe(marks[1]);
    expect(regressionMarkAtInstance(marks, -1)).toBeNull();
    expect(regressionMarkAtInstance(marks, 2)).toBeNull();
  });

  test("derives exact selected and whole-stage bounds from projected mark boxes", () => {
    const marks = [mark("cpu", 0), mark("request", 12)];

    expect(regressionMarkBounds(marks[0])).toEqual({
      min: [-3, 0, -3.5],
      max: [3, 8, 3.5],
    });
    expect(regressionProjectionBounds(marks)).toEqual({
      min: [-3, 0, -3.5],
      max: [15, 8, 3.5],
    });
  });
});

function mark(kind: RegressionMark["kind"], x: number): RegressionMark {
  return {
    findingId: findingId(`finding:v1:${kind}`),
    evidenceId: evidenceIdentity(`evidence:v1:${kind}`),
    contributorId: `contributor:v1:${kind}`,
    kind,
    domain: kind === "request" ? "network" : "browser",
    semanticIdentity: kind,
    title: kind,
    unit: "ms",
    scaleId: `scale:v1:${kind}-ms`,
    baselineValue: 10,
    candidateValue: 20,
    absoluteDelta: 10,
    status: "regression",
    availability: { state: "available" },
    gap: null,
    position: [x, 4, 0],
    size: [6, 8, 7],
  };
}
