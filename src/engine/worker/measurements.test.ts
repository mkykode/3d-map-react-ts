import { describe, expect, test } from "vitest";
import { sessionId, type AnalysisScope, type SessionId } from "../../domain/analysis";
import type { ParsedTraceModel } from "../types";
import type { CanonicalSessionData } from "./sessionRepository";
import {
  collectCpuSourceMeasurements,
  collectCpuSourceMeasurementsInterruptibly,
  type CpuSourceMeasurementSource,
} from "./measurements";

describe("worker CPU/source-frame measurements", () => {
  test("yields within large canonical source-sample scans without changing results", async () => {
    const baseline = ids("baseline", 3);
    const candidate = ids("candidate", 3);
    const sessions = new Map<SessionId, CanonicalSessionData>();
    for (const id of [...baseline, ...candidate]) {
      const session = canonical(1, "source-0");
      const evidence = session.evidence as { sourceSamples: Record<string, unknown>[] };
      evidence.sourceSamples = Array.from({ length: 129 }, (_, index) => ({
        ...evidence.sourceSamples[0],
        eventKey: `source-${index}`,
      }));
      sessions.set(id, session);
    }
    const inputScope = scope(baseline, candidate);
    const inputSource = source(sessions);
    const checkpoints: [number, number][] = [];

    const actual = await collectCpuSourceMeasurementsInterruptibly(
      inputSource,
      inputScope,
      async (completed, total) => {
        checkpoints.push([completed, total]);
      },
    );

    expect(actual).toEqual(collectCpuSourceMeasurements(inputSource, inputScope));
    expect(checkpoints).toContainEqual([128, 129]);
    expect(checkpoints).toContainEqual([129, 129]);
  });

  test("keeps absent run evidence nullable and excludes it from completeness", () => {
    const baseline = ids("baseline", 3);
    const candidate = ids("candidate", 3);
    const sessions = new Map<SessionId, CanonicalSessionData>([
      [baseline[0], canonical(5, "raw-1")],
      [baseline[1], canonical(null)],
      [baseline[2], canonical(null)],
      [candidate[0], canonical(9, "raw-2")],
      [candidate[1], canonical(10, "raw-3")],
      [candidate[2], canonical(11, "raw-4")],
    ]);
    const measurements = collectCpuSourceMeasurements(source(sessions), scope(baseline, candidate));

    expect(measurements).toHaveLength(1);
    expect(measurements[0]).toMatchObject({
      title: "work",
      baseline: {
        validSamples: 1,
        missingSamples: 2,
        completeness: 1 / 3,
        runs: [
          { sessionId: baseline[0], valueMs: 5, eventKeys: ["raw-1"] },
          { sessionId: baseline[1], valueMs: null, eventKeys: [] },
          { sessionId: baseline[2], valueMs: null, eventKeys: [] },
        ],
      },
      candidate: {
        validSamples: 3,
        missingSamples: 0,
        completeness: 1,
      },
    });
    expect(measurements[0].baseline.runs.map((run) => run.valueMs)).toEqual([
      5,
      null,
      null,
    ]);
  });

  test("measures only entries inside the selected scenario window", () => {
    const baseline = ids("baseline", 3);
    const candidate = ids("candidate", 3);
    const sessions = new Map<SessionId, CanonicalSessionData>(
      [...baseline, ...candidate].map((id) => [id, canonicalWithUnrelatedWork()]),
    );

    const [measurement] = collectCpuSourceMeasurements(
      source(sessions),
      scope(baseline, candidate),
    );

    expect(measurement.baseline.runs.map((run) => run.valueMs)).toEqual([5, 5, 5]);
    expect(measurement.candidate.runs.map((run) => run.valueMs)).toEqual([5, 5, 5]);
  });

  test("uses candidate source evidence and identifies its run", () => {
    const baseline = ids("baseline", 3);
    const candidate = ids("candidate", 3);
    const sessions = new Map<SessionId, CanonicalSessionData>([
      ...baseline.map((id, index) => [
        id,
        canonical(5, `baseline-${index}`, "function work(){return 'baseline'}"),
      ] as const),
      ...candidate.map((id, index) => [
        id,
        canonical(10, `candidate-${index}`, "function work(){return 'candidate'}"),
      ] as const),
    ]);

    const [measurement] = collectCpuSourceMeasurements(
      source(sessions),
      scope(baseline, candidate),
    );

    expect(measurement.source.generated.snippet).toContain("candidate");
    expect(measurement.sourceSessionId).toBe(candidate[0]);
    expect(measurement.sourceCohort).toBe("candidate");
  });

  test("clips self time at a partially overlapping scenario boundary", () => {
    const baseline = ids("baseline", 3);
    const candidate = ids("candidate", 3);
    const sessions = new Map<SessionId, CanonicalSessionData>(
      [...baseline, ...candidate].map((id) => [id, canonicalPartiallyOverlapping()]),
    );

    const [measurement] = collectCpuSourceMeasurements(
      source(sessions),
      scope(baseline, candidate),
    );

    expect(measurement.baseline.runs.map((run) => run.valueMs)).toEqual([5, 5, 5]);
    expect(measurement.candidate.runs.map((run) => run.valueMs)).toEqual([5, 5, 5]);
  });

  test("ranks a complete canonical source sample beyond the 24-lane rendering cap", () => {
    const baseline = ids("baseline", 3);
    const candidate = ids("candidate", 3);
    const sessions = new Map<SessionId, CanonicalSessionData>(
      [...baseline, ...candidate].map((id) => [id, canonicalBeyondRenderingCap(id)]),
    );

    const measurements = collectCpuSourceMeasurements(
      source(sessions),
      scope(baseline, candidate),
    );

    expect(measurements).toEqual([
      expect.objectContaining({
        title: "offscreenWork",
        baseline: expect.objectContaining({ validSamples: 3 }),
        candidate: expect.objectContaining({ validSamples: 3 }),
      }),
    ]);
    expect(measurements[0].candidate.runs[0]).toMatchObject({
      valueMs: 7,
      eventKeys: [`${candidate[0]}:offscreen-source`],
    });
  });
});

function ids(cohort: "baseline" | "candidate", count: number): SessionId[] {
  return Array.from({ length: count }, (_, index) =>
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

function source(
  sessions: ReadonlyMap<SessionId, CanonicalSessionData>,
): CpuSourceMeasurementSource {
  return {
    getCanonicalForWorker(id) {
      const value = sessions.get(id);
      if (!value) throw new Error(`Unknown session: ${id}`);
      return value;
    },
  };
}

function canonical(
  valueMs: number | null,
  eventKey = "",
  sourceContent?: string,
): CanonicalSessionData {
  const projection = emptyProjection();
  const sourceFrames = valueMs === null
    ? []
    : [
        {
          functionName: "work",
          scriptUrl: "https://example.test/app.js",
          scriptId: "1",
          lineNumber: 0,
          columnNumber: 9,
        },
      ];
  if (valueMs !== null) {
    projection.callFrames.push({
      functionNameId: 0,
      urlId: 0,
      scriptId: "1",
      lineNumber: 0,
      columnNumber: 9,
    });
    projection.functionNames.push("work");
    projection.scriptUrls.push("https://example.test/app.js");
    projection.eventKeys.push(eventKey);
    projection.lanes.push({
      meta: {
        id: 0,
        name: "Main",
        kind: "main",
        entryCount: 1,
        maxDepth: 0,
        maxDur: valueMs,
      },
      starts: new Float64Array([0]),
      durs: new Float64Array([valueMs]),
      depths: new Uint16Array([0]),
      catIds: new Uint8Array([0]),
      selfTimes: new Float64Array([valueMs]),
      parentIndexes: new Int32Array([-1]),
      exclusiveOffsets: new Uint32Array([0, 1]),
      exclusiveStarts: new Float64Array([0]),
      exclusiveEnds: new Float64Array([valueMs]),
      nameIds: new Uint32Array([0]),
      callFrameIds: new Uint32Array([1]),
      eventKeyIds: new Uint32Array([1]),
    });
  }
  return {
    importSha256: "a".repeat(64),
    payloadSha256: "b".repeat(64),
    metadata: { scenario: "checkout" },
    settings: {},
    evidence: {
      sourceFrames,
      sourceSamples: valueMs === null ? [] : [{
        frame: sourceFrames[0],
        startMs: 0,
        durationMs: valueMs,
        selfTimeMs: valueMs,
        eventKey,
        exclusiveSpans: [[0, valueMs]],
      }],
      events: valueMs === null
        ? []
        : [canonicalEvent(eventKey, "checkout", 0, valueMs)],
    },
    screenshots: [],
    resources: sourceContent
      ? [{
          url: "https://example.test/app.js",
          mimeType: "text/javascript",
          content: sourceContent,
          scriptId: "1",
        }]
      : [],
    sourceMaps: [],
    scanIndexes: {},
    retainedBytes: 1_024,
    compatibilityProjection: projection,
  };
}

function canonicalWithUnrelatedWork(): CanonicalSessionData {
  const value = canonical(5, "inside");
  const projection = value.compatibilityProjection!;
  const lane = projection.lanes[0];
  projection.eventKeys.push("outside");
  lane.starts = new Float64Array([0, 100]);
  lane.durs = new Float64Array([5, 50]);
  lane.depths = new Uint16Array([0, 0]);
  lane.catIds = new Uint8Array([0, 0]);
  lane.selfTimes = new Float64Array([5, 50]);
  lane.parentIndexes = new Int32Array([-1, -1]);
  lane.exclusiveOffsets = new Uint32Array([0, 1, 2]);
  lane.exclusiveStarts = new Float64Array([0, 100]);
  lane.exclusiveEnds = new Float64Array([5, 150]);
  lane.nameIds = new Uint32Array([0, 0]);
  lane.callFrameIds = new Uint32Array([1, 1]);
  lane.eventKeyIds = new Uint32Array([1, 2]);
  value.evidence = {
    sourceFrames: (value.evidence as { sourceFrames: unknown[] }).sourceFrames,
    sourceSamples: [
      {
        frame: (value.evidence as { sourceSamples: { frame: unknown }[] }).sourceSamples[0].frame,
        startMs: 0,
        durationMs: 5,
        selfTimeMs: 5,
        eventKey: "inside",
        exclusiveSpans: [[0, 5]],
      },
      {
        frame: (value.evidence as { sourceSamples: { frame: unknown }[] }).sourceSamples[0].frame,
        startMs: 100,
        durationMs: 50,
        selfTimeMs: 50,
        eventKey: "outside",
        exclusiveSpans: [[100, 150]],
      },
    ],
    events: [
      canonicalEvent("inside", "checkout", 0, 5),
      canonicalEvent("outside", "search", 100, 50),
    ],
  };
  return value;
}

function canonicalPartiallyOverlapping(): CanonicalSessionData {
  const value = canonical(10, "partial");
  value.evidence = {
    sourceFrames: (value.evidence as { sourceFrames: unknown[] }).sourceFrames,
    sourceSamples: [{
      ...(value.evidence as { sourceSamples: Record<string, unknown>[] }).sourceSamples[0],
      startMs: 0,
      durationMs: 10,
      selfTimeMs: 10,
      exclusiveSpans: [[0, 10]],
    }],
    events: [canonicalEvent("scenario", "checkout", 5, 10)],
  };
  return value;
}

function canonicalBeyondRenderingCap(id: SessionId): CanonicalSessionData {
  const value = canonical(null);
  value.compatibilityProjection = emptyProjection();
  value.compatibilityProjection.totalThreads = 25;
  value.evidence = {
    events: [canonicalEvent("scenario", "checkout", 0, 20)],
    sourceFrames: [],
    sourceSamples: [{
      frame: {
        functionName: "offscreenWork",
        scriptUrl: "https://example.test/offscreen.js",
        scriptId: "25",
        lineNumber: 4,
        columnNumber: 2,
      },
      startMs: 2,
      durationMs: 7,
      selfTimeMs: 7,
      eventKey: `${id}:offscreen-source`,
      exclusiveSpans: [[2, 9]],
    }],
  };
  return value;
}

function canonicalEvent(
  key: string,
  scenario: string,
  startMs: number,
  durationMs: number,
) {
  return {
    key,
    name: "FixtureTask",
    category: "devtools.timeline",
    phase: "X",
    processId: 100,
    threadId: 101,
    startMs,
    durationMs,
    data: { args: { data: { scenario } } },
  };
}

function emptyProjection(): ParsedTraceModel {
  return {
    boundsMinUs: 0,
    rangeMs: 20,
    lanes: [],
    names: [],
    functionNames: [],
    scriptUrls: [],
    callFrames: [],
    eventKeys: [],
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
    parseMs: 1,
  };
}
