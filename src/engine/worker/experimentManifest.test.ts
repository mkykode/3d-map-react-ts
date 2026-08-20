import { describe, expect, test } from "vitest";
import { sessionId, type SessionId } from "../../domain/analysis";
import { ENGINE_LIMITS } from "../limits";
import type {
  CanonicalSessionData,
  SessionSnapshot,
} from "./sessionRepository";
import {
  buildExperimentManifest,
  type ExperimentManifestSource,
} from "./experimentManifest";

describe("worker experiment manifest", () => {
  test.each([
    [3, 3],
    [4, 3],
    [4, 4],
    [5, 5],
  ])("admits a memory-valid %i+%i controlled experiment", (baselineCount, candidateCount) => {
    const source = makeSource(baselineCount, candidateCount);
    const manifest = buildExperimentManifest(source, {
      baselineSessionIds: ids("baseline", baselineCount),
      candidateSessionIds: ids("candidate", candidateCount),
      scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
      acceptedDifferences: [],
    });

    expect(manifest).toMatchObject({
      state: "ready",
      issues: [],
      coverage: {
        baselineRuns: baselineCount,
        candidateRuns: candidateCount,
        readyRuns: baselineCount + candidateCount,
        scenarioRuns: baselineCount + candidateCount,
      },
      memory: {
        limitBytes: ENGINE_LIMITS.aggregateRetainedAndInFlightBytes,
      },
    });
    expect(manifest.scope?.baselineSessionIds).toHaveLength(baselineCount);
    expect(manifest.scope?.candidateSessionIds).toHaveLength(candidateCount);
  });

  test.each([
    [2, 3, "baseline-cardinality", "Baseline cohort must contain 3 to 5 runs"],
    [3, 6, "candidate-cardinality", "Candidate cohort must contain 3 to 5 runs"],
  ])(
    "blocks invalid %i+%i cardinality with a specific reason",
    (baselineCount, candidateCount, code, detail) => {
      const manifest = buildExperimentManifest(makeSource(baselineCount, candidateCount), {
        baselineSessionIds: ids("baseline", baselineCount),
        candidateSessionIds: ids("candidate", candidateCount),
        scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
        acceptedDifferences: [],
      });

      expect(manifest.state).toBe("blocked");
      expect(manifest.scope).toBeNull();
      expect(manifest.issues).toContainEqual({ code, detail, sessionIds: [] });
    },
  );

  test("blocks aggregate-memory overflow before ranking", () => {
    const source = makeSource(3, 3, {
      totalBytes: ENGINE_LIMITS.aggregateRetainedAndInFlightBytes + 1,
    });
    const manifest = buildExperimentManifest(source, {
      baselineSessionIds: ids("baseline", 3),
      candidateSessionIds: ids("candidate", 3),
      scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
      acceptedDifferences: [],
    });

    expect(manifest).toMatchObject({
      state: "blocked",
      scope: null,
      issues: [
        {
          code: "aggregate-memory",
          detail: "Experiment exceeds the aggregate retained and in-flight memory limit",
        },
      ],
    });
  });

  test("blocks unrelated scenarios and unresolved capture differences", () => {
    const source = makeSource(3, 3, {
      overrides: {
        "session:v1:candidate-2": {
          scenario: "search",
          captureContext: { browserContext: "incognito" },
        },
      },
    });
    const manifest = buildExperimentManifest(source, {
      baselineSessionIds: ids("baseline", 3),
      candidateSessionIds: ids("candidate", 3),
      scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
      acceptedDifferences: [],
    });

    expect(manifest.state).toBe("blocked");
    expect(manifest.scope).toBeNull();
    expect(manifest.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "scenario-missing" }),
        expect.objectContaining({ code: "capture-context" }),
      ]),
    );
  });

  test("keeps accepted capture differences visible without blocking ranking", () => {
    const source = makeSource(3, 3, {
      overrides: {
        "session:v1:candidate-2": {
          captureContext: { throttling: "4x-cpu" },
        },
      },
    });
    const manifest = buildExperimentManifest(source, {
      baselineSessionIds: ids("baseline", 3),
      candidateSessionIds: ids("candidate", 3),
      scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
      acceptedDifferences: ["throttling"],
    });

    expect(manifest.state).toBe("ready");
    expect(manifest.differences).toContainEqual(
      expect.objectContaining({ field: "throttling", accepted: true }),
    );
    expect(manifest.issues).toEqual([]);
  });

  test("blocks missing capture context instead of treating shared unknowns as compatible", () => {
    const manifest = buildExperimentManifest(
      makeSource(3, 3, { omitCaptureContext: true }),
      {
        baselineSessionIds: ids("baseline", 3),
        candidateSessionIds: ids("candidate", 3),
        scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
        acceptedDifferences: [],
      },
    );

    expect(manifest.state).toBe("blocked");
    expect(manifest.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "capture-context",
          detail: "Capture context is missing for browserContext",
        }),
        expect.objectContaining({
          code: "capture-context",
          detail: "Capture context is missing for throttling",
        }),
        expect.objectContaining({
          code: "capture-context",
          detail: "Capture context is missing for navigationOwnership",
        }),
      ]),
    );
  });

  test("publishes the selected Phase 5 domains and defaults to every supported domain", () => {
    const source = makeSource(3, 3);
    const input = {
      baselineSessionIds: ids("baseline", 3),
      candidateSessionIds: ids("candidate", 3),
      scenario: { kind: "marker" as const, markerName: "checkout", occurrence: 1 },
      acceptedDifferences: [],
    };

    expect(buildExperimentManifest(source, {
      ...input,
      domains: ["network", "metric"],
    }).scope?.domains).toEqual(["network", "metric"]);
    expect(buildExperimentManifest(source, input).scope?.domains).toEqual([
      "cpu-source",
      "browser",
      "network",
      "frame",
      "metric",
    ]);
  });
});

function ids(cohort: "baseline" | "candidate", count: number): SessionId[] {
  return Array.from({ length: count }, (_, index) =>
    sessionId(`session:v1:${cohort}-${index + 1}`),
  );
}

function makeSource(
  baselineCount: number,
  candidateCount: number,
  options: {
    totalBytes?: number;
    omitCaptureContext?: boolean;
    overrides?: Record<
      string,
      {
        scenario?: string;
        captureContext?: Record<string, string>;
      }
    >;
  } = {},
): ExperimentManifestSource {
  const sessions = new Map<SessionId, CanonicalSessionData>();
  for (const id of [...ids("baseline", baselineCount), ...ids("candidate", candidateCount)]) {
    const override = options.overrides?.[id];
    sessions.set(id, {
      importSha256: "a".repeat(64),
      payloadSha256: "b".repeat(64),
      metadata: {
        scenario: override?.scenario ?? "checkout",
        ...(!options.omitCaptureContext
          ? {
              captureContext: {
                browserContext: "regular",
                throttling: "none",
                navigationOwnership: "main-frame",
                ...override?.captureContext,
              },
            }
          : {}),
      },
      settings: {},
      evidence: {
        navigations: [],
        events: [{
          key: "scenario-1",
          name: "FixtureTask",
          category: "devtools.timeline",
          phase: "X",
          processId: 1,
          threadId: 1,
          startMs: 0,
          durationMs: 1,
          data: {
            args: {
              data: { scenario: override?.scenario ?? "checkout" },
            },
          },
        }],
      },
      screenshots: [],
      resources: [],
      sourceMaps: [],
      scanIndexes: {},
      retainedBytes: 1_024,
    });
  }
  return {
    accounting: {
      retainedBytes: options.totalBytes ?? sessions.size * 1_024,
      inFlightBytes: 0,
      totalBytes: options.totalBytes ?? sessions.size * 1_024,
    },
    get(id): SessionSnapshot {
      const canonical = sessions.get(id);
      if (!canonical) throw new Error(`Unknown session: ${id}`);
      return {
        id,
        state: "ready",
        progress: { stage: "ready", completed: 1, total: 1, sequence: 1 },
        projectedPeakBytes: 0,
        retainedBytes: canonical.retainedBytes,
        hasIntermediates: false,
        availability: { state: "available" },
      };
    },
    getCanonicalForWorker(id) {
      const canonical = sessions.get(id);
      if (!canonical) throw new Error(`Unknown session: ${id}`);
      return canonical;
    },
  };
}
