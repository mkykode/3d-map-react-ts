import { describe, expect, test } from "vitest";
import { sessionId, type AnalysisScope, type SessionId } from "../../domain/analysis";
import { ENGINE_LIMITS } from "../limits";
import { makeSourceMapFixture } from "../../test/traceEnvelopeFixtures";
import { rankCpuSourceMeasurements } from "./cpuSourceAnalysis";
import { buildCpuSourceEvidenceSlice } from "./evidenceSlice";
import type { CpuSourceMeasurement } from "./measurements";
import { buildRegressionProjection } from "./regressionProjection";
import type { CanonicalSessionData } from "./sessionRepository";
import { resolveTracerSource } from "./tracerSource";

describe("CPU/source tracer bullet", () => {
  test("returns deterministic bounded marks invertible to exact evidence", () => {
    const baseline = ids("baseline");
    const candidate = ids("candidate");
    const scopeValue = scope(baseline, candidate);
    const findings = rankCpuSourceMeasurements([
      measurement("valid", baseline, candidate, "work", [10, 11, 9], [20, 21, 19]),
      measurement("valid", baseline, candidate, "other", [8, 8, 8], [8, 8, 8]),
    ]);

    const analysis = {
      scope: scopeValue,
      findings: findings.map((result) => result.finding),
    };
    const first = buildRegressionProjection(analysis, scopeValue);
    const second = buildRegressionProjection(analysis, scopeValue);

    expect(first).toEqual(second);
    expect(first.marks).toHaveLength(2);
    expect(first.byteLength).toBeLessThanOrEqual(ENGINE_LIMITS.projectionBytes);
    expect(first.marks.find((mark) => mark.findingId === findings[0].finding.id)).toMatchObject({
      findingId: findings[0].finding.id,
      evidenceId: findings[0].finding.evidenceIds[0],
      domain: "cpu-source",
      kind: "source",
      unit: "ms",
      baselineValue: 10,
      candidateValue: 20,
      absoluteDelta: 10,
      status: "regression",
    });
    expect(JSON.stringify(first)).not.toContain("eventKeys");
    expect(JSON.stringify(first)).not.toContain("snippet");

    const slice = buildCpuSourceEvidenceSlice(
      findings[0],
      scopeValue,
      sessions([...baseline, ...candidate]),
    );
    expect(slice.byteLength).toBeLessThanOrEqual(ENGINE_LIMITS.evidenceSliceBytes);
    expect(slice.payload).toMatchObject({
      finding: findings[0].finding,
      contributors: {
        baseline: [
          { sessionId: baseline[0], valueMs: 10, eventKeys: ["baseline-work-1"] },
          { sessionId: baseline[1], valueMs: 11, eventKeys: ["baseline-work-2"] },
          { sessionId: baseline[2], valueMs: 9, eventKeys: ["baseline-work-3"] },
        ],
        candidate: [
          { sessionId: candidate[0], valueMs: 20, eventKeys: ["candidate-work-1"] },
          { sessionId: candidate[1], valueMs: 21, eventKeys: ["candidate-work-2"] },
          { sessionId: candidate[2], valueMs: 19, eventKeys: ["candidate-work-3"] },
        ],
      },
      source: {
        mappingState: "mapped",
        authoredFallbackUsed: false,
        generated: { availability: { state: "available" } },
        authored: { availability: { state: "available" } },
      },
      provenance: { runs: { length: 6 } },
    });
  });

  test("retains generated fallback and a specific authored mapping failure", () => {
    const baseline = ids("baseline");
    const candidate = ids("candidate");
    const [finding] = rankCpuSourceMeasurements([
      measurement("malformed", baseline, candidate, "work", [10, 11, 9], [20, 21, 19]),
    ]);
    const slice = buildCpuSourceEvidenceSlice(
      finding,
      scope(baseline, candidate),
      sessions([...baseline, ...candidate]),
    );

    expect(slice.payload.source).toMatchObject({
      mappingState: "malformed",
      mappingFailure: {
        state: "unavailable",
        reason: "malformed-source-map",
      },
      authoredFallbackUsed: true,
      generated: { availability: { state: "available" } },
      authored: { availability: { state: "available" } },
    });
  });

  test("refuses to join a cached finding to a different analysis scope", () => {
    const baseline = ids("baseline");
    const candidate = ids("candidate");
    const [finding] = rankCpuSourceMeasurements([
      measurement("valid", baseline, candidate, "work", [10, 11, 9], [20, 21, 19]),
    ]);
    const mismatchedScope = scope(
      [sessionId("session:v1:other-1"), ...baseline.slice(1)],
      candidate,
    );

    expect(() => buildRegressionProjection({
      scope: scope(baseline, candidate),
      findings: [finding.finding],
    }, mismatchedScope)).toThrow(
      "Regression projection scope does not match the active analysis",
    );
    expect(() =>
      buildCpuSourceEvidenceSlice(
        finding,
        mismatchedScope,
        sessions([...baseline, ...candidate]),
      ),
    ).toThrow("Finding does not belong to the requested analysis scope");
  });
});

function ids(cohort: "baseline" | "candidate"): SessionId[] {
  return Array.from({ length: 3 }, (_, index) =>
    sessionId(`session:v1:${cohort}-${index + 1}`),
  );
}

function scope(
  baselineSessionIds: readonly SessionId[],
  candidateSessionIds: readonly SessionId[],
): AnalysisScope {
  return {
    version: 1,
    baselineSessionIds,
    candidateSessionIds,
    scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
    timeWindowMs: null,
    domains: ["cpu-source"],
    selectedFindingId: null,
    selectedEvidenceId: null,
  };
}

function measurement(
  mapState: "valid" | "malformed",
  baselineIds: readonly SessionId[],
  candidateIds: readonly SessionId[],
  functionName: string,
  baselineValues: readonly number[],
  candidateValues: readonly number[],
): CpuSourceMeasurement {
  const fixture = makeSourceMapFixture();
  const source = resolveTracerSource(
    {
      functionName,
      scriptId: "1",
      generatedUrl: fixture.generatedUrl,
      generatedLine: 0,
      generatedColumn: 9,
    },
    [{
      url: fixture.generatedUrl,
      mimeType: "text/javascript",
      content: fixture.generatedContent,
      sourceMapUrl: fixture.mapUrl,
    }],
    { [fixture.mapUrl]: mapState === "valid" ? fixture.map : "not-json" },
  );
  return {
    semanticIdentity: source.identity.key,
    title: functionName,
    source,
    sourceSessionId: candidateIds[0],
    sourceCohort: "candidate",
    baseline: cohort(baselineIds, baselineValues, `baseline-${functionName}`),
    candidate: cohort(candidateIds, candidateValues, `candidate-${functionName}`),
  };
}

function cohort(
  sessionIds: readonly SessionId[],
  values: readonly number[],
  eventPrefix: string,
) {
  return {
    runs: values.map((valueMs, index) => ({
      sessionId: sessionIds[index],
      valueMs,
      eventKeys: [`${eventPrefix}-${index + 1}`],
    })),
    validSamples: values.length,
    missingSamples: 0,
    completeness: 1,
  };
}

function sessions(ids: readonly SessionId[]) {
  const values = new Map(ids.map((id, index) => [id, canonical(index)]));
  return {
    getCanonicalForWorker(id: SessionId) {
      const value = values.get(id);
      if (!value) throw new Error(`Unknown session: ${id}`);
      return value;
    },
  };
}

function canonical(index: number): CanonicalSessionData {
  return {
    importSha256: index.toString(16).repeat(64),
    payloadSha256: String.fromCharCode(97 + index).repeat(64),
    metadata: {},
    settings: {},
    evidence: {},
    screenshots: [],
    resources: [],
    sourceMaps: [],
    scanIndexes: {},
    retainedBytes: 1,
  };
}
