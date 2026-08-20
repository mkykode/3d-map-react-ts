import { describe, expect, test } from "vitest";
import { sessionId } from "../../domain/analysis";
import { ENGINE_LIMITS } from "../limits";
import { TraceSessionRepository } from "./sessionRepository";

describe("TraceSessionRepository", () => {
  test("reports deterministic progress and cancellation without publishing stale readiness", () => {
    const repository = new TraceSessionRepository();
    const id = sessionId("session:v1:baseline-1");

    expect(repository.reserve(id, { importedBytes: 100, projectedPeakBytes: 1_000 })).toMatchObject({
      state: "reserved",
      progress: { stage: "reserved", completed: 0, total: 100, sequence: 0 },
    });
    expect(repository.beginIngest(id).progress).toMatchObject({ stage: "ingesting", sequence: 1 });
    expect(repository.updateIngestProgress(id, 40).progress).toEqual({
      stage: "ingesting",
      completed: 40,
      total: 100,
      sequence: 2,
    });

    expect(repository.cancel(id)).toMatchObject({
      state: "canceled",
      progress: { stage: "canceled", completed: 40, total: 100, sequence: 3 },
    });
    expect(() => repository.beginCanonicalize(id, emptyIntermediates())).toThrow(
      "Cannot transition canceled session",
    );
  });

  test("reports a specific canceled availability reason and releases in-flight accounting", () => {
    const repository = new TraceSessionRepository();
    const id = sessionId("session:v1:candidate-1");
    repository.reserve(id, { importedBytes: 100, projectedPeakBytes: 1_000 });
    repository.beginIngest(id);
    repository.beginCanonicalize(id, emptyIntermediates());

    expect(repository.cancel(id)).toMatchObject({
      state: "canceled",
      availability: {
        state: "unavailable",
        reason: "canceled",
        detail: "Canceled by user",
      },
      hasIntermediates: false,
      projectedPeakBytes: 0,
    });
    expect(repository.accounting.inFlightBytes).toBe(0);
  });

  test("retains memory-valid 3-5 cohorts without eviction and releases commit intermediates", () => {
    const repository = new TraceSessionRepository();
    const baseline = Array.from({ length: 5 }, (_, index) =>
      sessionId(`session:v1:baseline-${index + 1}`),
    );
    const candidate = Array.from({ length: 5 }, (_, index) =>
      sessionId(`session:v1:candidate-${index + 1}`),
    );
    let firstIntermediates: ReturnType<typeof populatedIntermediates> | null = null;

    for (const [index, id] of [...baseline, ...candidate].entries()) {
      repository.reserve(id, { importedBytes: 100, projectedPeakBytes: 1_000 });
      repository.beginIngest(id);
      const intermediates = populatedIntermediates();
      if (index === 0) firstIntermediates = intermediates;
      repository.beginCanonicalize(id, intermediates);
      repository.commit(id, canonicalData(2_000));
    }

    expect(repository.admitCohort(baseline, candidate)).toMatchObject({
      baseline: { length: 5 },
      candidate: { length: 5 },
    });
    expect(repository.accounting).toEqual({
      retainedBytes: 20_000,
      inFlightBytes: 0,
      totalBytes: 20_000,
    });
    expect(firstIntermediates).toMatchObject({
      importedBytes: null,
      decompressedBytes: null,
      decodedText: null,
      rawEvents: null,
      traceEngineData: null,
    });
    expect(() => repository.admitCohort(baseline.slice(0, 2), candidate.slice(0, 3))).toThrow(
      "baseline cohort must contain 3 to 5 sessions",
    );
    expect(() =>
      repository.reserve(sessionId("session:v1:over-budget"), {
        importedBytes: 100,
        projectedPeakBytes: ENGINE_LIMITS.aggregateRetainedAndInFlightBytes,
      }),
    ).toThrow("Aggregate retained and in-flight memory limit exceeded");
    expect(repository.get(baseline[0]).state).toBe("ready");
  });
});

function emptyIntermediates() {
  return {
    importedBytes: new Uint8Array(),
    decompressedBytes: new Uint8Array(),
    decodedText: "",
    rawEvents: [],
    traceEngineData: null,
  };
}

function populatedIntermediates() {
  return {
    importedBytes: new Uint8Array([1]),
    decompressedBytes: new Uint8Array([1]),
    decodedText: "{}",
    rawEvents: [{}],
    traceEngineData: {},
  };
}

function canonicalData(retainedBytes: number) {
  return {
    importSha256: "a".repeat(64),
    payloadSha256: "b".repeat(64),
    metadata: {},
    settings: {},
    evidence: {},
    screenshots: [],
    resources: [],
    sourceMaps: [],
    scanIndexes: {},
    retainedBytes,
  };
}
