import { describe, expect, test } from "vitest";
import { sessionId } from "../../domain/analysis";
import { evidenceIdentity } from "../../domain/evidence";
import { semanticIdentity } from "./identity";
import { rankFindings } from "./rankFindings";

describe("frozen cohort finding policy", () => {
  test("reports median effects, pooled MAD, samples, completeness, and evidence quality", () => {
    const [result] = rankFindings([{
      identity: semanticIdentity({ kind: "browser-domain", domain: "scripting" }),
      title: "Scripting",
      domain: "browser",
      unit: "ms",
      matchStatus: "matched",
      baselineRuns: runs("baseline", [10, 11, 9, null]),
      candidateRuns: runs("candidate", [20, 18, 23, 21]),
      evidenceIds: [evidenceIdentity("evidence:v1:scripting")],
    }]);

    expect(result.finding).toMatchObject({
      status: "regression",
      measurement: {
        baseline: 10,
        candidate: 20.5,
        absoluteDelta: 10.5,
        relativeDelta: 1.05,
        dispersion: 2.2239,
        baselineSamples: 3,
        candidateSamples: 4,
        baselineCompleteness: 0.75,
        candidateCompleteness: 1,
      },
      evidenceQuality: {
        class: "stable-non-source-identity",
        weight: 0.85,
      },
      derivation: { version: "median-mad-v1" },
    });
    expect(result.score).toBeCloseTo((10.5 / 2.2239) * 0.75 * 0.85);
    expect(result.runSamples.baseline.map((sample) => sample.value)).toEqual([
      10,
      11,
      9,
      null,
    ]);
  });

  test("keeps a positive noisy outlier inconclusive and explains the dispersion gate", () => {
    const [result] = rankFindings([{
      identity: semanticIdentity({ kind: "metric", name: "Long task time" }),
      title: "Long task time",
      domain: "metric",
      unit: "ms",
      matchStatus: "matched",
      baselineRuns: runs("baseline", [10, 10, 10]),
      candidateRuns: runs("candidate", [10, 30, 100]),
      evidenceIds: [evidenceIdentity("evidence:v1:long-task-time")],
    }]);

    expect(result.finding).toMatchObject({
      status: "inconclusive",
      measurement: { absoluteDelta: 20 },
      promotion: {
        eligible: false,
        reasons: ["effect-within-dispersion"],
      },
    });
    expect(result.finding.measurement.dispersion).toBeCloseTo(29.652);
  });

  test("keeps missing run evidence unknown instead of zero-filling it", () => {
    const [result] = rankFindings([{
      identity: semanticIdentity({ kind: "frame-outcome", outcome: "dropped" }),
      title: "Dropped frames",
      domain: "frame",
      unit: "count",
      matchStatus: "matched",
      baselineRuns: runs("baseline", [null, null, null]),
      candidateRuns: runs("candidate", [5, 6, 7]),
      evidenceIds: [evidenceIdentity("evidence:v1:dropped-frames")],
    }]);

    expect(result.finding).toMatchObject({
      status: "inconclusive",
      measurement: {
        baseline: null,
        candidate: 6,
        absoluteDelta: null,
        relativeDelta: null,
        baselineSamples: 0,
        candidateSamples: 3,
      },
      missingness: {
        state: "unknown",
        baselineMissing: 3,
        candidateMissing: 0,
      },
      availability: { state: "unavailable", reason: "omitted-evidence" },
    });
    expect(result.score).toBe(0);
  });
});

function runs(cohort: "baseline" | "candidate", values: readonly (number | null)[]) {
  return values.map((value, index) => ({
    sessionId: sessionId(`session:v1:${cohort}-${index + 1}`),
    value,
    eventKeys: value === null ? [] : [`${cohort}-event-${index + 1}`],
  }));
}
