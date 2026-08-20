import type { FindingId } from "../../domain/analysis";
import type { FindingDetail } from "../findingContract";
import { ENGINE_LIMITS } from "../limits";
import type { ExperimentAnalysisResult } from "./analysisResult";
import { encodedJsonBytes } from "./serialization";

export function buildFindingDetail(
  analysis: ExperimentAnalysisResult,
  findingId: FindingId,
  maxBytes = ENGINE_LIMITS.evidenceSliceBytes,
): FindingDetail {
  const result = analysis.rankedFindings.find((entry) => entry.finding.id === findingId);
  if (!result) throw new Error(`Finding detail not found: ${findingId}`);
  const provenance = analysis.provenanceByFindingId.get(findingId);
  if (!provenance) throw new Error(`Finding provenance not found: ${findingId}`);
  const payload = { version: 1 as const, finding: result.finding, provenance };
  const byteLength = encodedJsonBytes(payload);
  if (byteLength > maxBytes) {
    throw new Error(`Finding detail byte limit exceeded: ${byteLength} > ${maxBytes}`);
  }
  return { ...payload, byteLength };
}
