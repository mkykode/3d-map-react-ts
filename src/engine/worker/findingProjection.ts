import type {
  AnalysisDomain,
  AnalysisScope,
} from "../../domain/analysis";
import type {
  FindingProjection,
  FindingProjectionMark,
} from "../findingContract";
import { ENGINE_LIMITS } from "../limits";
import type { ExperimentAnalysisResult } from "./analysisResult";
import { encodedJsonBytes } from "./serialization";

export function buildFindingProjection(
  analysis: ExperimentAnalysisResult,
  scope: AnalysisScope,
  maxBytes = ENGINE_LIMITS.projectionBytes,
): FindingProjection {
  const maxima = new Map<string, number>();
  for (const finding of analysis.findings) {
    const key = `${finding.domain}:${finding.measurement.unit}`;
    maxima.set(
      key,
      Math.max(maxima.get(key) ?? 0, Math.abs(finding.measurement.absoluteDelta ?? 0)),
    );
  }
  const domainRanks = new Map<AnalysisDomain, number>();
  const marks = analysis.findings.map((finding, rank): FindingProjectionMark => {
    const evidenceId = finding.evidenceIds[0];
    if (!evidenceId) throw new Error(`Finding has no stable evidence identity: ${finding.id}`);
    const domainRank = domainRanks.get(finding.domain) ?? 0;
    domainRanks.set(finding.domain, domainRank + 1);
    const maximum = maxima.get(`${finding.domain}:${finding.measurement.unit}`) ?? 0;
    return {
      findingId: finding.id,
      evidenceId,
      rank,
      domainRank,
      domain: finding.domain,
      title: finding.title,
      status: finding.status,
      unit: finding.measurement.unit,
      magnitudeRatio: maximum === 0
        ? 0
        : Math.abs(finding.measurement.absoluteDelta ?? 0) / maximum,
    };
  });
  const payload = {
    version: 1 as const,
    layout: "ranked-findings-grid-v1" as const,
    scenario: scope.scenario,
    marks,
  };
  const byteLength = encodedJsonBytes(payload);
  if (byteLength > maxBytes) {
    throw new Error(`Finding projection byte limit exceeded: ${byteLength} > ${maxBytes}`);
  }
  return { ...payload, byteLength };
}
