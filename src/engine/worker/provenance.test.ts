import { describe, expect, test } from "vitest";
import { sessionId, type AnalysisDomain, type AnalysisScope, type SessionId } from "../../domain/analysis";
import { evidenceIdentity } from "../../domain/evidence";
import { makeSourceMapFixture } from "../../test/traceEnvelopeFixtures";
import { rankCpuSourceMeasurements } from "./cpuSourceAnalysis";
import type { CpuSourceMeasurement } from "./measurements";
import { semanticIdentity } from "./identity";
import { buildCpuSourceProvenance, buildFindingProvenance } from "./provenance";
import { rankFindings } from "./rankFindings";
import type { CanonicalSessionData } from "./sessionRepository";
import { resolveTracerSource } from "./tracerSource";

describe("CPU/source finding provenance", () => {
  test("attaches exact cohort, hashes, scope, events, source mapping, and derivation", () => {
    const baseline = ids("baseline");
    const candidate = ids("candidate");
    const measurement = sourceMeasurement(baseline, candidate);
    const [result] = rankCpuSourceMeasurements([measurement]);
    const canonical = new Map<SessionId, CanonicalSessionData>();
    [...baseline, ...candidate].forEach((id, index) => {
      canonical.set(id, canonicalHashes(index));
    });
    const provenance = buildCpuSourceProvenance(
      result,
      scope(baseline, candidate),
      {
        getCanonicalForWorker(id) {
          const value = canonical.get(id);
          if (!value) throw new Error(`Unknown session: ${id}`);
          return value;
        },
      },
    );

    expect(provenance).toMatchObject({
      version: 1,
      findingId: result.finding.id,
      scope: {
        scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
        timeWindowMs: null,
      },
      source: {
        identity: result.source.identity,
        mappingState: "mapped",
        generatedPosition: {
          url: "https://example.test/assets/app.a1b2c3.js",
          line: 0,
          column: 9,
        },
        authoredPosition: {
          url: "webpack:///src/work.ts",
          line: 0,
          column: 9,
        },
      },
      derivation: {
        version: "median-mad-v1",
        parameters: result.finding.derivation.parameters,
      },
    });
    expect(provenance.runs).toHaveLength(6);
    expect(provenance.runs[0]).toEqual({
      cohort: "baseline",
      sessionId: baseline[0],
      importSha256: "0".repeat(64),
      payloadSha256: "a".repeat(64),
      eventKeys: ["baseline-event-1"],
      value: 10,
      evidenceLabel: "trace-observation",
      evidenceState: "observed",
    });
    expect(provenance.runs[5]).toMatchObject({
      cohort: "candidate",
      sessionId: candidate[2],
      eventKeys: ["candidate-event-3"],
    });
  });

  test("attaches exact provenance to every non-source finding class", () => {
    const baseline = ids("baseline");
    const candidate = ids("candidate");
    const analysisScope: AnalysisScope = {
      ...scope(baseline, candidate),
      domains: ["browser", "network", "frame", "metric"],
    };
    const canonical = new Map<SessionId, CanonicalSessionData>();
    [...baseline, ...candidate].forEach((id, index) => {
      canonical.set(id, canonicalHashes(index));
    });
    const sessions = {
      getCanonicalForWorker(id: SessionId) {
        const value = canonical.get(id);
        if (!value) throw new Error(`Unknown session: ${id}`);
        return value;
      },
    };
    const findings = [
      candidateFor("browser", semanticIdentity({ kind: "browser-domain", domain: "scripting" })),
      candidateFor("network", semanticIdentity({
        kind: "request",
        method: "GET",
        url: "https://example.test/api",
      })),
      candidateFor("frame", semanticIdentity({ kind: "frame-outcome", outcome: "dropped" })),
      candidateFor("metric", semanticIdentity({ kind: "metric", name: "LCP" })),
    ].flatMap((candidateInput) => rankFindings([candidateInput]));
    const provenance = findings.map((finding) =>
      buildFindingProvenance(finding, analysisScope, sessions));

    expect(provenance.map((entry) => entry.domain)).toEqual([
      "browser",
      "network",
      "frame",
      "metric",
    ]);
    expect(provenance[1]).toMatchObject({
      semanticIdentity: "request:GET:https://example.test/api",
      scope: {
        baselineSessionIds: baseline,
        candidateSessionIds: candidate,
        scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
        timeWindowMs: null,
        domains: ["browser", "network", "frame", "metric"],
      },
      derivation: {
        version: "median-mad-v1",
        parameters: findings[1].finding.derivation.parameters,
      },
    });
    expect(provenance[1].runs[0]).toEqual({
      cohort: "baseline",
      sessionId: baseline[0],
      importSha256: "0".repeat(64),
      payloadSha256: "a".repeat(64),
      eventKeys: ["browser-event-1"],
      value: 10,
      evidenceLabel: "trace-observation",
      evidenceState: "observed",
    });
    expect(provenance.every((entry) => entry.source === null)).toBe(true);
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

function sourceMeasurement(
  baseline: readonly SessionId[],
  candidate: readonly SessionId[],
): CpuSourceMeasurement {
  const fixture = makeSourceMapFixture();
  const source = resolveTracerSource(
    {
      functionName: "work",
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
    { [fixture.mapUrl]: fixture.map },
  );
  return {
    semanticIdentity: source.identity.key,
    title: "work",
    source,
    sourceSessionId: candidate[0],
    sourceCohort: "candidate",
    baseline: cohort(baseline, [10, 11, 9], "baseline"),
    candidate: cohort(candidate, [20, 21, 19], "candidate"),
  };
}

function cohort(
  sessionIds: readonly SessionId[],
  values: readonly number[],
  name: "baseline" | "candidate",
) {
  return {
    runs: values.map((valueMs, index) => ({
      sessionId: sessionIds[index],
      valueMs,
      eventKeys: [`${name}-event-${index + 1}`],
    })),
    validSamples: values.length,
    missingSamples: 0,
    completeness: 1,
  };
}

function canonicalHashes(index: number): CanonicalSessionData {
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

function candidateFor(
  domain: Exclude<AnalysisDomain, "cpu-source" | "periodicity">,
  identity: ReturnType<typeof semanticIdentity>,
) {
  return {
    identity,
    title: identity.title,
    domain,
    unit: "ms" as const,
    matchStatus: "matched" as const,
    baselineRuns: provenanceSamples("baseline", [10, 11, 9]),
    candidateRuns: provenanceSamples("candidate", [20, 21, 19]),
    evidenceIds: [evidenceIdentity(`evidence:v1:${domain}`)],
  };
}

function provenanceSamples(
  cohort: "baseline" | "candidate",
  values: readonly number[],
) {
  return values.map((value, index) => ({
    sessionId: sessionId(`session:v1:${cohort}-${index + 1}`),
    value,
    eventKeys: [`browser-event-${index + 1}`],
  }));
}
