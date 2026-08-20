import type { AnalysisScope } from "../../domain/analysis";
import { evidenceIdentity } from "../../domain/evidence";
import { stableToken } from "../../lib/stable";
import type { FindingSourceProvenance } from "../findingContract";
import { semanticIdentity } from "./identity";
import {
  collectCpuSourceMeasurements,
  type CpuSourceMeasurement,
} from "./measurements";
import type { FindingCandidate } from "./rankFindings";
import type { CanonicalSessionSource } from "./sessionRepository";

export function collectCpuSourceCandidates(
  source: CanonicalSessionSource,
  scope: AnalysisScope,
  sourceBySemanticKey: Map<string, FindingSourceProvenance>,
  cpuMeasurementBySemanticKey: Map<string, CpuSourceMeasurement>,
): FindingCandidate[] {
  return cpuCandidatesFromMeasurements(
    collectCpuSourceMeasurements(source, scope),
    sourceBySemanticKey,
    cpuMeasurementBySemanticKey,
  );
}

export function cpuCandidatesFromMeasurements(
  measurements: readonly CpuSourceMeasurement[],
  sourceBySemanticKey: Map<string, FindingSourceProvenance>,
  cpuMeasurementBySemanticKey: Map<string, CpuSourceMeasurement>,
): FindingCandidate[] {
  return measurements.map((measurement) => {
    const identity = semanticIdentity({ kind: "source-frame", source: measurement.source.identity });
    sourceBySemanticKey.set(identity.key, {
      identity: measurement.source.identity,
      mappingState: measurement.source.mappingState,
      mappingFailure: measurement.source.mappingFailure,
      generatedPosition: position(measurement.source.generated),
      authoredPosition: measurement.source.authored
        ? position(measurement.source.authored)
        : null,
    });
    cpuMeasurementBySemanticKey.set(identity.key, measurement);
    const hasBaseline = measurement.baseline.validSamples > 0;
    const hasCandidate = measurement.candidate.validSamples > 0;
    return {
      identity,
      title: measurement.title,
      domain: "cpu-source",
      unit: "ms",
      matchStatus: hasBaseline && hasCandidate
        ? "matched"
        : hasCandidate ? "added" : "removed",
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
      evidenceIds: [evidenceIdentity(`evidence:v1:cpu-source-${stableToken(identity.key)}`)],
    };
  });
}

function position(value: { url: string; line: number; column: number }) {
  return { url: value.url, line: value.line, column: value.column };
}
