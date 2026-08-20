import { describe, expect, test } from "vitest";
import { resolveScenarioBounds } from "./analysisBounds";
import type { CanonicalSessionData } from "./sessionRepository";

describe("analysis bounds", () => {
  test("resolves the requested tagged marker occurrence", () => {
    const canonical = canonicalWithOccurrences();

    expect(resolveScenarioBounds(canonical, {
      kind: "marker",
      markerName: "checkout",
      occurrence: 2,
    })).toEqual([100, 110]);
  });
});

function canonicalWithOccurrences(): CanonicalSessionData {
  return {
    importSha256: "a".repeat(64),
    payloadSha256: "b".repeat(64),
    metadata: {},
    settings: {},
    evidence: {
      events: [
        event("checkout", 0, 10),
        event("search", 50, 10),
        event("checkout", 100, 10),
      ],
    },
    screenshots: [],
    resources: [],
    sourceMaps: [],
    scanIndexes: {},
    retainedBytes: 1,
  };
}

function event(scenario: string, startMs: number, durationMs: number) {
  return {
    startMs,
    durationMs,
    data: {
      args: {
        data: { scenario },
      },
    },
  };
}
