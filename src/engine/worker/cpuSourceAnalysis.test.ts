import { describe, expect, test } from "vitest";
import { sessionId } from "../../domain/analysis";
import { makeSourceMapFixture } from "../../test/traceEnvelopeFixtures";
import type { CpuSourceMeasurement } from "./measurements";
import { resolveTracerSource } from "./tracerSource";
import {
  buildBoundedFindingSummaries,
  rankCpuSourceMeasurements,
} from "./cpuSourceAnalysis";

describe("preregistered CPU/source-frame ranking", () => {
  test("ranks a stable authored-source regression with complete cohort effects", () => {
    const findings = rankCpuSourceMeasurements([
      measurement("webpack:///src/work.ts", [10, 11, 9], [20, 21, 19]),
      measurement("webpack:///src/other.ts", [8, 8, 8], [8, 8, 8]),
    ]);

    expect(findings).toHaveLength(2);
    expect(findings[0].finding).toMatchObject({
      domain: "cpu-source",
      title: "work",
      status: "regression",
      measurement: {
        unit: "ms",
        baseline: 10,
        candidate: 20,
        absoluteDelta: 10,
        relativeDelta: 1,
        dispersion: 1.4826,
        baselineSamples: 3,
        candidateSamples: 3,
      },
      evidenceLevel: "derived-association",
      availability: { state: "available" },
      derivation: {
        version: "median-mad-v1",
        parameters: {
          normalConsistencyScale: 1.4826,
          dispersionRule: "maximum-of-baseline-and-candidate-scaled-mad",
          promotionDispersionMultiplier: 2,
          unitFloorMs: 0.1,
        },
      },
    });
    expect(findings[0].finding.semanticIdentity).toContain("src/work.ts");
    expect(findings[1].finding.semanticIdentity).toContain("src/other.ts");
    expect(findings[0].score).toBeGreaterThan(findings[1].score);
  });

  test("keeps a noisy outlier inconclusive and exposes its dispersion", () => {
    const [result] = rankCpuSourceMeasurements([
      measurement("webpack:///src/noisy.ts", [10, 10, 10], [10, 30, 100]),
    ]);

    expect(result.finding.status).toBe("inconclusive");
    expect(result.finding.measurement).toMatchObject({
      baseline: 10,
      candidate: 30,
      absoluteDelta: 20,
      baselineSamples: 3,
      candidateSamples: 3,
    });
    expect(result.finding.measurement.dispersion).toBeCloseTo(29.652);
  });

  test("does not promote incomplete evidence with fewer than three valid runs", () => {
    const value = measurement("webpack:///src/incomplete.ts", [10, null, null], [20, 21, 19]);
    const [result] = rankCpuSourceMeasurements([value]);

    expect(result.finding).toMatchObject({
      status: "inconclusive",
      availability: {
        state: "unavailable",
        reason: "omitted-evidence",
      },
      measurement: { baselineSamples: 1, candidateSamples: 3 },
    });
  });

  test("does not promote negative deltas under the frozen regression policy", () => {
    const [result] = rankCpuSourceMeasurements([
      measurement("webpack:///src/faster.ts", [20, 21, 19], [10, 11, 9]),
    ]);

    expect(result.finding.measurement.absoluteDelta).toBe(-10);
    expect(result.finding.status).toBe("inconclusive");
    expect(result.score).toBe(0);
  });

  test("rejects finding summaries that exceed their transfer budget", () => {
    const findings = rankCpuSourceMeasurements([
      measurement("webpack:///src/work.ts", [10, 11, 9], [20, 21, 19]),
    ]);

    expect(() => buildBoundedFindingSummaries(findings, 1)).toThrow(
      "Finding summary byte limit exceeded",
    );
  });
});

function measurement(
  authoredUrl: string,
  baselineValues: readonly (number | null)[],
  candidateValues: readonly (number | null)[],
): CpuSourceMeasurement {
  const fixture = makeSourceMapFixture();
  const map = JSON.parse(fixture.map) as Record<string, unknown>;
  map.sources = [authoredUrl];
  const source = resolveTracerSource(
    {
      functionName: "work",
      scriptId: "1",
      generatedUrl: fixture.generatedUrl,
      generatedLine: 0,
      generatedColumn: 9,
    },
    [
      {
        url: fixture.generatedUrl,
        mimeType: "text/javascript",
        content: fixture.generatedContent,
        sourceMapUrl: fixture.mapUrl,
      },
    ],
    { [fixture.mapUrl]: JSON.stringify(map) },
  );
  return {
    semanticIdentity: source.identity.key,
    title: "work",
    source,
    sourceSessionId: sessionId("session:v1:candidate-1"),
    sourceCohort: "candidate",
    baseline: cohort("baseline", baselineValues),
    candidate: cohort("candidate", candidateValues),
  };
}

function cohort(
  name: "baseline" | "candidate",
  values: readonly (number | null)[],
) {
  const runs = values.map((valueMs, index) => ({
    sessionId: sessionId(`session:v1:${name}-${index + 1}`),
    valueMs,
    eventKeys: valueMs === null ? [] : [`raw-${index + 1}`],
  }));
  const validSamples = runs.filter((run) => run.valueMs !== null).length;
  return {
    runs,
    validSamples,
    missingSamples: runs.length - validSamples,
    completeness: validSamples / runs.length,
  };
}
