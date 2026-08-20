import { describe, expect, test } from "vitest";
import { sessionId, type AnalysisScope, type SessionId } from "../../domain/analysis";
import { evidenceIdentity } from "../../domain/evidence";
import {
  evidenceSliceQuery,
  type EvidenceSliceSection,
} from "../../evidence/query";
import type { AdapterCanonicalEvidence } from "../adapter";
import type { ExperimentManifest } from "../experimentContract";
import { ENGINE_LIMITS } from "../limits";
import type { ExperimentAnalysisResult } from "./analysisResult";
import { buildFindingEvidenceSlice } from "./evidenceSlice";
import { semanticIdentity } from "./identity";
import { buildFindingProvenance } from "./provenance";
import { buildRegressionProjection } from "./regressionProjection";
import { rankFindings } from "./rankFindings";
import type { CanonicalSessionData } from "./sessionRepository";

describe("on-demand finding evidence slices", () => {
  test("returns only requested exact contributor, timeline, table, screenshot, and provenance sections", () => {
    const fixture = analysisFixture();
    const projection = buildRegressionProjection(fixture.analysis, fixture.scope);
    const mark = projection.marks[0];
    const include: readonly EvidenceSliceSection[] = [
      "contributors",
      "timeline",
      "table",
      "screenshots",
      "provenance",
    ];

    const slice = buildFindingEvidenceSlice(
      fixture.analysis,
      fixture.scope,
      fixture.sessions,
      evidenceSliceQuery({
        findingId: mark.findingId,
        evidenceId: mark.evidenceId,
        contributorId: mark.contributorId,
        include,
        byteBudget: ENGINE_LIMITS.evidenceSliceBytes,
      }),
    );

    expect(slice.byteLength).toBeLessThanOrEqual(ENGINE_LIMITS.evidenceSliceBytes);
    expect(slice.payload.requested).toEqual(include);
    expect(slice.payload.sections.contributors).toHaveLength(6);
    expect(slice.payload.sections.timeline?.items).toHaveLength(6);
    expect(slice.payload.sections.timeline?.gaps).toEqual([]);
    expect(slice.payload.sections.table).toHaveLength(6);
    expect(slice.payload.sections.screenshots).toHaveLength(6);
    expect(slice.payload.sections.provenance).toMatchObject({
      findingId: mark.findingId,
      runs: { length: 6 },
    });
    expect(slice.payload.sections.timeline?.items[0]).toMatchObject({
      eventKey: "baseline-1:scripting",
      startMs: 10,
      endMs: 20,
      unit: "ms",
    });
  });

  test("reports missing event records as explicit gaps without inventing timeline items", () => {
    const fixture = analysisFixture({ omitCandidateEvent: true });
    const mark = buildRegressionProjection(fixture.analysis, fixture.scope).marks[0];
    const slice = buildFindingEvidenceSlice(
      fixture.analysis,
      fixture.scope,
      fixture.sessions,
      evidenceSliceQuery({
        findingId: mark.findingId,
        evidenceId: mark.evidenceId,
        contributorId: mark.contributorId,
        include: ["timeline"],
        byteBudget: ENGINE_LIMITS.evidenceSliceBytes,
      }),
    );

    expect(slice.payload.sections.timeline?.items).toHaveLength(5);
    expect(slice.payload.sections.timeline?.gaps).toEqual([{
      sessionId: sessionId("session:v1:candidate-3"),
      eventKey: "candidate-3:scripting",
      reason: "missing-event",
    }]);
    expect(slice.payload.sections.contributors).toBeUndefined();
    expect(slice.payload.sections.provenance).toBeUndefined();
  });

  test("rejects over-limit output and caller budgets instead of truncating", () => {
    const fixture = analysisFixture();
    const mark = buildRegressionProjection(fixture.analysis, fixture.scope).marks[0];
    const query = {
      findingId: mark.findingId,
      evidenceId: mark.evidenceId,
      contributorId: mark.contributorId,
      include: ["contributors", "timeline", "table", "screenshots", "provenance"] as const,
    };

    expect(() => buildFindingEvidenceSlice(
      fixture.analysis,
      fixture.scope,
      fixture.sessions,
      evidenceSliceQuery({ ...query, byteBudget: 1 }),
    )).toThrow("Evidence slice byte limit exceeded");
    expect(() => evidenceSliceQuery({
      ...query,
      byteBudget: ENGINE_LIMITS.evidenceSliceBytes + 1,
    })).toThrow("Evidence slice budget exceeds the engine limit");
  });
});

function analysisFixture(options: { omitCandidateEvent?: boolean } = {}) {
  const scope = analysisScope();
  const rankedFindings = rankFindings([{
    identity: semanticIdentity({ kind: "browser-domain", domain: "scripting" }),
    title: "scripting",
    domain: "browser",
    unit: "ms",
    matchStatus: "matched",
    baselineRuns: runSamples(scope.baselineSessionIds, "baseline", 10),
    candidateRuns: runSamples(scope.candidateSessionIds, "candidate", 20),
    evidenceIds: [evidenceIdentity("evidence:v1:browser-scripting")],
  }]);
  const sessions = sessionSource(scope, options);
  const provenanceByFindingId = new Map(rankedFindings.map((entry) => [
    entry.finding.id,
    buildFindingProvenance(entry, scope, sessions),
  ]));
  const analysis: ExperimentAnalysisResult = {
    scope,
    compatibility: { state: "ready", issues: [] as ExperimentManifest["issues"] },
    findings: rankedFindings.map((entry) => entry.finding),
    rankedFindings,
    sourceByFindingId: new Map(),
    provenanceByFindingId,
    cpuSourceByFindingId: new Map(),
    byteLength: 0,
  };
  return { analysis, scope, sessions };
}

function analysisScope(): AnalysisScope {
  return {
    version: 1,
    baselineSessionIds: ids("baseline"),
    candidateSessionIds: ids("candidate"),
    scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
    timeWindowMs: [0, 100],
    domains: ["browser"],
    selectedFindingId: null,
    selectedEvidenceId: null,
  };
}

function ids(cohort: string): SessionId[] {
  return Array.from({ length: 3 }, (_, index) =>
    sessionId(`session:v1:${cohort}-${index + 1}`));
}

function runSamples(sessionIds: readonly SessionId[], cohort: string, value: number) {
  return sessionIds.map((id, index) => ({
    sessionId: id,
    value,
    eventKeys: [`${cohort}-${index + 1}:scripting`],
  }));
}

function sessionSource(
  scope: AnalysisScope,
  options: { omitCandidateEvent?: boolean },
) {
  const sessions = new Map<SessionId, CanonicalSessionData>();
  [...scope.baselineSessionIds, ...scope.candidateSessionIds].forEach((id, index) => {
    const cohort = index < 3 ? "baseline" : "candidate";
    const run = (index % 3) + 1;
    const eventKey = `${cohort}-${run}:scripting`;
    const omit = options.omitCandidateEvent && cohort === "candidate" && run === 3;
    const evidence: AdapterCanonicalEvidence = {
      eventCount: omit ? 0 : 1,
      events: omit ? [] : [{
        key: eventKey,
        name: "RunTask",
        category: "devtools.timeline",
        phase: "X",
        processId: 1,
        threadId: 1,
        startMs: 10,
        durationMs: cohort === "baseline" ? 10 : 20,
        data: {},
      }],
      sourceFrames: [],
      sourceSamples: [],
      animationFrames: [],
      interactions: [],
      layoutShifts: [],
      userTimings: [],
      metrics: [],
      navigations: [],
      requests: [],
      frames: [],
      memory: [],
      screenshots: [{ ts: 15, dataUri: `data:image/png;base64,${cohort}${run}` }],
    };
    sessions.set(id, {
      importSha256: "a".repeat(64),
      payloadSha256: "b".repeat(64),
      metadata: {},
      settings: {},
      evidence,
      screenshots: evidence.screenshots,
      resources: [],
      sourceMaps: [],
      scanIndexes: {},
      retainedBytes: 1,
    });
  });
  return {
    getCanonicalForWorker(id: SessionId) {
      const session = sessions.get(id);
      if (!session) throw new Error(`Unknown session: ${id}`);
      return session;
    },
  };
}
