import { describe, expect, test } from "vitest";
import { sessionId, type AnalysisDomain, type AnalysisScope } from "../../domain/analysis";
import { evidenceIdentity } from "../../domain/evidence";
import type { ExperimentManifest } from "../experimentContract";
import type { ExperimentAnalysisResult } from "./analysisResult";
import { buildRegressionProjection } from "./regressionProjection";
import { rankFindings, type FindingCandidate } from "./rankFindings";
import { semanticIdentity, type SemanticIdentityInput } from "./identity";

describe("regression projection", () => {
  test("projects every supported mark kind with independent declared scales and stable invertible IDs", () => {
    const analysis = analysisResult([
      candidate("metric", "ms", { kind: "metric", name: "LCP" }),
      candidate("network", "ms", { kind: "request", method: "GET", url: "https://example.test/app.js" }),
      candidate("frame", "count", { kind: "frame-outcome", outcome: "dropped" }),
      candidate("browser", "ms", { kind: "browser-domain", domain: "gpu" }),
      candidate("browser", "ms", { kind: "browser-domain", domain: "scripting" }),
      candidate("cpu-source", "ms", null, "source-frame:generated:app.js:work"),
      unmatchedNetworkCandidate(),
    ]);

    const first = buildRegressionProjection(analysis, analysis.scope);
    const second = buildRegressionProjection(analysis, analysis.scope);

    expect(first).toEqual(second);
    expect(first.marks.map((mark) => mark.kind)).toEqual([
      "cpu",
      "gpu",
      "network",
      "frame",
      "request",
      "metric",
      "source",
    ]);
    expect(new Set(first.marks.map((mark) => mark.contributorId)).size).toBe(
      first.marks.length,
    );
    for (const mark of first.marks) {
      expect(first.contributors[mark.contributorId]).toEqual({
        findingId: mark.findingId,
        evidenceId: mark.evidenceId,
      });
      expect(first.scales[mark.scaleId]).toMatchObject({
        unit: mark.unit,
        kind: "linear",
      });
    }
    expect(first.marks.find((mark) => mark.kind === "cpu")?.scaleId).not.toBe(
      first.marks.find((mark) => mark.kind === "gpu")?.scaleId,
    );
    expect(first.marks.find((mark) => mark.kind === "gpu")?.scaleId).not.toBe(
      first.marks.find((mark) => mark.kind === "request")?.scaleId,
    );
    expect(first.marks.find((mark) => mark.kind === "network")?.gap).toMatchObject({
      state: "gap",
      reason: "unsupported-join",
    });
    expect(first.edges).toEqual([]);
    expect(JSON.stringify(first)).not.toContain("eventKeys");
  });

  test("rejects a projection that exceeds its byte budget instead of truncating marks", () => {
    const analysis = analysisResult([
      candidate("browser", "ms", { kind: "browser-domain", domain: "scripting" }),
    ]);

    expect(() => buildRegressionProjection(analysis, analysis.scope, 1)).toThrow(
      "Regression projection byte limit exceeded",
    );
  });
});

function candidate(
  domain: AnalysisDomain,
  unit: FindingCandidate["unit"],
  identityInput: SemanticIdentityInput | null,
  semanticKey?: string,
): FindingCandidate {
  const identity = identityInput ? semanticIdentity(identityInput) : null;
  const key = identity?.key ?? semanticKey ?? `${domain}:unknown`;
  return {
    identity,
    semanticKey: key,
    title: identity?.title ?? key,
    domain,
    unit,
    matchStatus: "matched",
    baselineRuns: samples("baseline", 10, key),
    candidateRuns: samples("candidate", 20, key),
    evidenceIds: [evidenceIdentity(`evidence:v1:${domain}-${token(key)}`)],
  };
}

function unmatchedNetworkCandidate(): FindingCandidate {
  const key = "unmatched:candidate:request-1";
  return {
    ...candidate("network", "ms", null, key),
    matchStatus: "unmatched",
    baselineRuns: samples("baseline", null, key),
  };
}

function samples(cohort: string, value: number | null, key: string) {
  return Array.from({ length: 3 }, (_, index) => ({
    sessionId: sessionId(`session:v1:${cohort}-${index + 1}`),
    value,
    eventKeys: value === null ? [] : [`${cohort}-${token(key)}-${index + 1}`],
  }));
}

function analysisResult(candidates: readonly FindingCandidate[]): ExperimentAnalysisResult {
  const scope: AnalysisScope = {
    version: 1,
    baselineSessionIds: samples("baseline", 0, "scope").map((run) => run.sessionId),
    candidateSessionIds: samples("candidate", 0, "scope").map((run) => run.sessionId),
    scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
    timeWindowMs: null,
    domains: ["cpu-source", "browser", "network", "frame", "metric"],
    selectedFindingId: null,
    selectedEvidenceId: null,
  };
  const rankedFindings = rankFindings(candidates);
  return {
    scope,
    compatibility: { state: "ready", issues: [] as ExperimentManifest["issues"] },
    findings: rankedFindings.map((entry) => entry.finding),
    rankedFindings,
    sourceByFindingId: new Map(),
    provenanceByFindingId: new Map(),
    cpuSourceByFindingId: new Map(),
    byteLength: 0,
  };
}

function token(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "-");
}
