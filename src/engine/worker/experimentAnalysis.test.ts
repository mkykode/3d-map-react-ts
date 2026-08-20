import { describe, expect, test } from "vitest";
import {
  analysisJobId,
  sessionId,
  type AnalysisScope,
  type SessionId,
} from "../../domain/analysis";
import type { AdapterCanonicalEvidence, CanonicalEventRecord } from "../adapter";
import type { ParsedTraceModel } from "../types";
import type { ExperimentManifest } from "../experimentContract";
import { runExperimentAnalysis, runExperimentAnalysisJob } from "./experimentAnalysis";
import { buildFindingDetail } from "./findingDetail";
import { JobController, type JobEvent } from "./jobController";
import type { CanonicalSessionData } from "./sessionRepository";

describe("complete worker experiment analysis", () => {
  test("returns complete cohort effects for compatible browser-domain evidence", () => {
    const analysisScope = scope([10, 11, 9], [20, 21, 19], ["browser"]);
    const result = runExperimentAnalysis(
      sourceFor(analysisScope, [10, 11, 9], [20, 21, 19]),
      readyManifest(analysisScope),
      analysisScope,
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      domain: "browser",
      semanticIdentity: "browser-domain:scripting",
      status: "regression",
      measurement: {
        baseline: 10,
        candidate: 20,
        absoluteDelta: 10,
        relativeDelta: 1,
        dispersion: 1.4826,
        baselineSamples: 3,
        candidateSamples: 3,
        baselineCompleteness: 1,
        candidateCompleteness: 1,
      },
    });
  });

  test("ranks same-named source frames from different files independently", () => {
    const analysisScope = scope([10, 11, 9], [20, 21, 19], ["cpu-source"]);
    const result = runExperimentAnalysis(
      sourceFor(analysisScope, [10, 11, 9], [20, 21, 19]),
      readyManifest(analysisScope),
      analysisScope,
    );

    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((finding) => ({
      title: finding.title,
      identity: finding.semanticIdentity,
      status: finding.status,
    }))).toEqual([
      {
        title: "work",
        identity:
          "source-frame:generated:generated\u0000https://example.test/a.js\u0000work\u00000\u00000",
        status: "regression",
      },
      {
        title: "work",
        identity:
          "source-frame:generated:generated\u0000https://example.test/b.js\u0000work\u00000\u00000",
        status: "regression",
      },
    ]);
  });

  test("retains added, removed, unmatched, frame, request, and metric entities", () => {
    const analysisScope = scope(
      [10, 11, 9],
      [20, 21, 19],
      ["network", "frame", "metric"],
    );
    const result = runExperimentAnalysis(
      unionSource(analysisScope),
      readyManifest(analysisScope),
      analysisScope,
    );

    expect(result.findings.map((finding) => ({
      domain: finding.domain,
      identity: finding.semanticIdentity,
      status: finding.status,
    }))).toEqual([
      {
        domain: "metric",
        identity: "metric:lcp",
        status: "regression",
      },
      {
        domain: "frame",
        identity: "frame-outcome:dropped",
        status: "added",
      },
      {
        domain: "frame",
        identity: "frame-outcome:presented",
        status: "removed",
      },
      {
        domain: "network",
        identity: "request:GET:https://example.test/new.js",
        status: "added",
      },
      {
        domain: "network",
        identity: "request:GET:https://example.test/old.js",
        status: "removed",
      },
      {
        domain: "network",
        identity: "unmatched:candidate:session:v1:candidate-1:request-1",
        status: "unmatched",
      },
      {
        domain: "network",
        identity: "unmatched:candidate:session:v1:candidate-2:request-1",
        status: "unmatched",
      },
      {
        domain: "network",
        identity: "unmatched:candidate:session:v1:candidate-3:request-1",
        status: "unmatched",
      },
    ]);
  });

  test("keeps a noisy positive effect inconclusive after compatibility succeeds", () => {
    const analysisScope = scope([10, 10, 10], [10, 30, 100], ["browser"]);
    const result = runExperimentAnalysis(
      sourceFor(analysisScope, [10, 10, 10], [10, 30, 100]),
      readyManifest(analysisScope),
      analysisScope,
    );

    expect(result.compatibility).toEqual({ state: "ready", issues: [] });
    expect(result.findings[0]).toMatchObject({
      status: "inconclusive",
      measurement: { absoluteDelta: 20 },
      promotion: {
        eligible: false,
        reasons: ["effect-within-dispersion"],
      },
    });
    expect(result.findings[0].measurement.dispersion).toBeCloseTo(29.652);
  });

  test("returns bounded exact provenance details for a selected finding", () => {
    const analysisScope = scope([10, 11, 9], [20, 21, 19], ["browser"]);
    const source = sourceFor(analysisScope, [10, 11, 9], [20, 21, 19]);
    const result = runExperimentAnalysis(
      source,
      readyManifest(analysisScope),
      analysisScope,
    );
    const detail = buildFindingDetail(
      result,
      result.findings[0].id,
    );

    expect(detail).toMatchObject({
      version: 1,
      finding: result.findings[0],
      provenance: {
        domain: "browser",
        semanticIdentity: "browser-domain:scripting",
        scope: {
          baselineSessionIds: analysisScope.baselineSessionIds,
          candidateSessionIds: analysisScope.candidateSessionIds,
          scenario: analysisScope.scenario,
          timeWindowMs: null,
        },
        derivation: result.findings[0].derivation,
      },
    });
    expect(detail.provenance.runs).toHaveLength(6);
    expect(detail.provenance.runs[0]).toMatchObject({
      sessionId: analysisScope.baselineSessionIds[0],
      importSha256: "a".repeat(64),
      payloadSha256: "b".repeat(64),
      eventKeys: [`${analysisScope.baselineSessionIds[0]}:scripting`],
      value: 10,
    });
    expect(detail.byteLength).toBeGreaterThan(0);
    expect(() => runExperimentAnalysis(
      source,
      readyManifest(analysisScope),
      analysisScope,
      1,
    )).toThrow("Finding summary byte limit exceeded");
    expect(() => buildFindingDetail(
      result,
      result.findings[0].id,
      1,
    )).toThrow("Finding detail byte limit exceeded");
  });

  test("keeps request methods distinct and uses canonical event keys for request, frame, and metric provenance", () => {
    const analysisScope = scope(
      [10, 11, 9],
      [20, 21, 19],
      ["network", "frame", "metric"],
    );
    const source = exactDomainSource(analysisScope);
    const result = runExperimentAnalysis(
      source,
      readyManifest(analysisScope),
      analysisScope,
    );

    expect(result.findings.filter((finding) => finding.domain === "network")
      .map((finding) => finding.semanticIdentity)).toEqual([
        "request:GET:https://example.test/api",
        "request:POST:https://example.test/api",
      ]);
    const expectedKeys = new Set([
      "raw-request-get",
      "raw-request-post",
      "legacy-frame-7",
      "raw-metric-lcp",
    ]);
    for (const finding of result.findings) {
      const detail = buildFindingDetail(result, finding.id);
      for (const run of detail.provenance.runs) {
        expect(run.eventKeys.length).toBeGreaterThan(0);
        expect(run.eventKeys.every((key) => expectedKeys.has(key))).toBe(true);
      }
    }
  });

  test("cancels during a large browser scan before the session collection completes", async () => {
    const analysisScope = scope([10, 11, 9], [20, 21, 19], ["browser"]);
    const source = sourceFor(analysisScope, [10, 11, 9], [20, 21, 19]);
    const largeSession = source.getCanonicalForWorker(analysisScope.baselineSessionIds[0]);
    const evidence = largeSession.evidence as AdapterCanonicalEvidence;
    evidence.events = [
      scenarioEvent(),
      ...Array.from({ length: 20_000 }, (_, index) => ({
        ...browserEvent(analysisScope.baselineSessionIds[0], 0.001),
        key: `large-browser-${index}`,
        startMs: 10 + index * 0.002,
      })),
    ];
    const manifest = readyManifest(analysisScope);
    const staleId = analysisJobId("job:v1:stale-analysis");
    const events: JobEvent<unknown>[] = [];
    const controller = new JobController<unknown>((event) => events.push(event));
    controller.enqueue({
      id: staleId,
      kind: "cohort-scan",
      run: (context) => runExperimentAnalysisJob(
        source,
        manifest,
        analysisScope,
        context,
      ),
    });
    setTimeout(() => controller.cancel(staleId), 0);

    await controller.idle();

    expect(events).toContainEqual(expect.objectContaining({
      type: "canceled",
      jobId: staleId,
      reason: "user-requested",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "progress",
      jobId: staleId,
      stage: "collect:browser",
      completed: expect.any(Number),
      total: 20_001,
    }));
    expect(events).not.toContainEqual(expect.objectContaining({
      type: "progress",
      jobId: staleId,
      stage: "collect:browser",
      completed: 20_001,
    }));
    expect(events).not.toContainEqual(expect.objectContaining({
      type: "result",
      jobId: staleId,
    }));
  });
});

function scope(
  baselineValues: readonly number[],
  candidateValues: readonly number[],
  domains: AnalysisScope["domains"],
): AnalysisScope {
  return {
    version: 1,
    baselineSessionIds: baselineValues.map((_, index) =>
      sessionId(`session:v1:baseline-${index + 1}`)),
    candidateSessionIds: candidateValues.map((_, index) =>
      sessionId(`session:v1:candidate-${index + 1}`)),
    scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
    timeWindowMs: null,
    domains,
    selectedFindingId: null,
    selectedEvidenceId: null,
  };
}

function sourceFor(
  analysisScope: AnalysisScope,
  baselineValues: readonly number[],
  candidateValues: readonly number[],
) {
  const canonical = new Map<SessionId, CanonicalSessionData>();
  analysisScope.baselineSessionIds.forEach((id, index) => {
    canonical.set(id, canonicalSession(id, baselineValues[index]));
  });
  analysisScope.candidateSessionIds.forEach((id, index) => {
    canonical.set(id, canonicalSession(id, candidateValues[index]));
  });
  return {
    getCanonicalForWorker(id: SessionId) {
      const value = canonical.get(id);
      if (!value) throw new Error(`Unknown session: ${id}`);
      return value;
    },
  };
}

function unionSource(analysisScope: AnalysisScope) {
  const canonical = new Map<SessionId, CanonicalSessionData>();
  analysisScope.baselineSessionIds.forEach((id, index) => {
    const session = canonicalSession(id, 10);
    const evidence = session.evidence as AdapterCanonicalEvidence;
    evidence.requests = [{
      start: 10,
      end: 20 + index,
      method: "GET",
      url: "https://example.test/old.js",
      renderBlocking: false,
      eventKey: "raw-request-old",
    }];
    evidence.frames = [{
      start: 20,
      end: 36,
      dropped: false,
      eventKey: "legacy-frame-presented",
    }];
    evidence.metrics = [{
      name: "LCP",
      label: "LCP",
      ts: 40 + index,
      eventKey: "raw-metric-lcp",
    }];
    canonical.set(id, session);
  });
  analysisScope.candidateSessionIds.forEach((id, index) => {
    const session = canonicalSession(id, 20);
    const evidence = session.evidence as AdapterCanonicalEvidence;
    evidence.requests = [
      {
        start: 10,
        end: 30 + index,
        method: "GET",
        url: "https://example.test/new.js",
        renderBlocking: false,
        eventKey: "raw-request-new",
      },
      {
        start: 35,
        end: 40,
        method: null,
        url: "/relative-unmatched.js",
        renderBlocking: false,
        eventKey: "raw-request-unmatched",
      },
    ];
    evidence.frames = [{
      start: 20,
      end: 36,
      dropped: true,
      eventKey: "legacy-frame-dropped",
    }];
    evidence.metrics = [{
      name: "LCP",
      label: "LCP",
      ts: 60 + index,
      eventKey: "raw-metric-lcp",
    }];
    canonical.set(id, session);
  });
  return {
    getCanonicalForWorker(id: SessionId) {
      const value = canonical.get(id);
      if (!value) throw new Error(`Unknown session: ${id}`);
      return value;
    },
  };
}

function exactDomainSource(analysisScope: AnalysisScope) {
  const canonical = new Map<SessionId, CanonicalSessionData>();
  for (const id of [
    ...analysisScope.baselineSessionIds,
    ...analysisScope.candidateSessionIds,
  ]) {
    const session = canonicalSession(id, 10);
    const evidence = session.evidence as AdapterCanonicalEvidence;
    evidence.requests = [
      {
        start: 10,
        end: 20,
        method: "GET",
        url: "https://example.test/api",
        renderBlocking: false,
        eventKey: "raw-request-get",
      },
      {
        start: 30,
        end: 40,
        method: "POST",
        url: "https://example.test/api",
        renderBlocking: false,
        eventKey: "raw-request-post",
      },
    ];
    evidence.frames = [{
      start: 20,
      end: 36,
      dropped: true,
      eventKey: "legacy-frame-7",
    }];
    evidence.metrics = [{
      name: "LCP",
      label: "LCP",
      ts: 60,
      eventKey: "raw-metric-lcp",
    }];
    canonical.set(id, session);
  }
  return {
    getCanonicalForWorker(id: SessionId) {
      const value = canonical.get(id);
      if (!value) throw new Error(`Unknown session: ${id}`);
      return value;
    },
  };
}

function canonicalSession(id: SessionId, scriptingMs: number): CanonicalSessionData {
  const evidence: AdapterCanonicalEvidence = {
    eventCount: 2,
    events: [scenarioEvent(), browserEvent(id, scriptingMs)],
    sourceFrames: [
      {
        functionName: "work",
        scriptUrl: "https://example.test/a.js",
        scriptId: "1",
        lineNumber: 0,
        columnNumber: 0,
      },
      {
        functionName: "work",
        scriptUrl: "https://example.test/b.js",
        scriptId: "2",
        lineNumber: 0,
        columnNumber: 0,
      },
    ],
    sourceSamples: [
      {
        frame: {
          functionName: "work",
          scriptUrl: "https://example.test/a.js",
          scriptId: "1",
          lineNumber: 0,
          columnNumber: 0,
        },
        startMs: 10,
        durationMs: scriptingMs,
        selfTimeMs: scriptingMs,
        eventKey: "source-a",
        exclusiveSpans: [[10, 10 + scriptingMs]],
      },
      {
        frame: {
          functionName: "work",
          scriptUrl: "https://example.test/b.js",
          scriptId: "2",
          lineNumber: 0,
          columnNumber: 0,
        },
        startMs: 50,
        durationMs: scriptingMs / 2,
        selfTimeMs: scriptingMs / 2,
        eventKey: "source-b",
        exclusiveSpans: [[50, 50 + scriptingMs / 2]],
      },
    ],
    animationFrames: [],
    interactions: [],
    layoutShifts: [],
    userTimings: [],
    metrics: [],
    navigations: [],
    requests: [],
    frames: [],
    memory: [],
    screenshots: [],
  };
  return {
    importSha256: "a".repeat(64),
    payloadSha256: "b".repeat(64),
    metadata: { captureContext: {
      browserContext: "stable",
      throttling: "none",
      navigationOwnership: "main-frame",
    } },
    settings: {},
    evidence,
    screenshots: [],
    resources: [],
    sourceMaps: [],
    scanIndexes: {},
    retainedBytes: 1,
    compatibilityProjection: sourceProjection(scriptingMs),
  };
}

function sourceProjection(valueMs: number): ParsedTraceModel {
  return {
    boundsMinUs: 0,
    rangeMs: 100,
    lanes: [{
      meta: {
        id: 1,
        name: "Main",
        kind: "main",
        processId: 1,
        threadId: 1,
        entryCount: 2,
        maxDepth: 0,
        maxDur: valueMs,
      },
      starts: new Float64Array([10, 50]),
      durs: new Float64Array([valueMs, valueMs / 2]),
      depths: new Uint16Array([0, 0]),
      catIds: new Uint8Array([2, 2]),
      selfTimes: new Float64Array([valueMs, valueMs / 2]),
      parentIndexes: new Int32Array([-1, -1]),
      exclusiveOffsets: new Uint32Array([0, 0, 0]),
      exclusiveStarts: new Float64Array(),
      exclusiveEnds: new Float64Array(),
      nameIds: new Uint32Array([0, 0]),
      callFrameIds: new Uint32Array([1, 2]),
      eventKeyIds: new Uint32Array([1, 2]),
    }],
    names: ["FunctionCall"],
    functionNames: ["work"],
    scriptUrls: ["https://example.test/a.js", "https://example.test/b.js"],
    callFrames: [
      { functionNameId: 0, urlId: 0, scriptId: "1", lineNumber: 0, columnNumber: 0 },
      { functionNameId: 0, urlId: 1, scriptId: "2", lineNumber: 0, columnNumber: 0 },
    ],
    eventKeys: ["source-a", "source-b"],
    processes: [],
    documentFrames: [],
    navigations: [],
    mainFrameId: null,
    mainFrameUrl: null,
    defaultNavigationId: null,
    markers: [],
    screenshots: [],
    frames: [],
    requests: [],
    memory: [],
    flows: [],
    totalThreads: 1,
    parseMs: 0,
  };
}

function scenarioEvent(): CanonicalEventRecord {
  return {
    key: "scenario",
    name: "RunTask",
    category: "devtools.timeline",
    phase: "X",
    processId: 1,
    threadId: 1,
    startMs: 0,
    durationMs: 100,
    data: { args: { data: { scenario: "checkout", scenarioOccurrence: 1 } } },
  };
}

function browserEvent(id: SessionId, durationMs: number): CanonicalEventRecord {
  return {
    key: `${id}:scripting`,
    name: "FunctionCall",
    category: "devtools.timeline",
    phase: "X",
    processId: 1,
    threadId: 1,
    startMs: 10,
    durationMs,
    data: {},
  };
}

function readyManifest(analysisScope: AnalysisScope): ExperimentManifest {
  return {
    version: 1,
    state: "ready",
    scope: analysisScope,
    runs: [],
    issues: [],
    differences: [],
    acceptedDifferences: [],
    coverage: {
      baselineRuns: 3,
      candidateRuns: 3,
      readyRuns: 6,
      scenarioRuns: 6,
      hashRuns: 6,
    },
    memory: { retainedBytes: 6, inFlightBytes: 0, totalBytes: 6, limitBytes: 1_000 },
  };
}
