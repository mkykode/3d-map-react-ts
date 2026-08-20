import { evidenceIdentity } from "../../domain/evidence";
import {
  findingId,
  type AnalysisScope,
  type Finding,
} from "../../domain/analysis";
import type { ExperimentManifest } from "../experimentContract";
import { compareAscii, stableToken } from "../../lib/stable";
import {
  collectCpuSourceMeasurements,
  type CpuSourceMeasurement,
  type CpuSourceMeasurementSource,
} from "./measurements";
import { ENGINE_LIMITS } from "../limits";
import { encodedJsonBytes } from "./serialization";
import {
  calculateCohortStatistics,
  MEDIAN_MAD_POLICY,
} from "./statistics";

const POLICY = {
  id: MEDIAN_MAD_POLICY.id,
  normalConsistencyScale: MEDIAN_MAD_POLICY.normalConsistencyScale,
  promotionDispersionMultiplier: MEDIAN_MAD_POLICY.promotionDispersionMultiplier,
  unitFloorMs: MEDIAN_MAD_POLICY.unitFloors.ms,
} as const;

export interface CpuSourceFinding {
  finding: Finding;
  score: number;
  source: CpuSourceMeasurement["source"];
  measurements: CpuSourceMeasurement;
  scope: AnalysisScope | null;
}

export function scanCpuSourceExperiment(
  source: CpuSourceMeasurementSource,
  manifest: ExperimentManifest,
): CpuSourceFinding[] {
  if (manifest.state !== "ready" || !manifest.scope) return [];
  return rankCpuSourceMeasurements(
    collectCpuSourceMeasurements(source, manifest.scope),
    manifest.scope,
  );
}

export function rankCpuSourceMeasurements(
  measurements: readonly CpuSourceMeasurement[],
  scope: AnalysisScope | null = null,
): CpuSourceFinding[] {
  return measurements
    .map((measurement) => buildFinding(measurement, scope))
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareAscii(
          left.finding.semanticIdentity,
          right.finding.semanticIdentity,
        ),
    );
}

export function buildBoundedFindingSummaries(
  results: readonly CpuSourceFinding[],
  maxBytes = ENGINE_LIMITS.projectionBytes,
): readonly Finding[] {
  const findings = results.map((result) => result.finding);
  const byteLength = encodedJsonBytes(findings);
  if (byteLength > maxBytes) {
    throw new Error(`Finding summary byte limit exceeded: ${byteLength} > ${maxBytes}`);
  }
  return findings;
}

function buildFinding(
  measurement: CpuSourceMeasurement,
  scope: AnalysisScope | null,
): CpuSourceFinding {
  const statistics = calculateCohortStatistics({
    unit: "ms",
    baselineRuns: measurement.baseline.runs.map((run) => ({
      sessionId: run.sessionId,
      value: run.valueMs,
      eventKeys: run.eventKeys,
    })),
    candidateRuns: measurement.candidate.runs.map((run) => ({
      sessionId: run.sessionId,
      value: run.valueMs,
      eventKeys: run.eventKeys,
    })),
    evidenceQuality:
      measurement.source.identity.kind === "authored"
        ? "authored-source"
        : "generated-source",
    completeIdentity: true,
  });
  const token = stableToken(measurement.semanticIdentity);
  const finding: Finding = {
    version: 1,
    id: findingId(`finding:v1:cpu-source-${token}`),
    domain: "cpu-source",
    semanticIdentity: measurement.semanticIdentity,
    title: measurement.title,
    status: statistics.promotion.eligible ? "regression" : "inconclusive",
    measurement: statistics.measurement,
    evidenceLevel: "derived-association",
    evidenceQuality: statistics.evidenceQuality,
    promotion: statistics.promotion,
    missingness: statistics.missingness,
    availability: statistics.availability,
    evidenceIds: [evidenceIdentity(`evidence:v1:cpu-source-${token}`)],
    derivation: {
      version: POLICY.id,
      parameters: {
        normalConsistencyScale: POLICY.normalConsistencyScale,
        dispersionRule: "maximum-of-baseline-and-candidate-scaled-mad",
        promotionDispersionMultiplier: POLICY.promotionDispersionMultiplier,
        unitFloorMs: POLICY.unitFloorMs,
      },
    },
  };
  return {
    finding,
    score: statistics.score,
    source: measurement.source,
    measurements: measurement,
    scope,
  };
}
