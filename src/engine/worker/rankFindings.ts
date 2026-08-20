import {
  findingId,
  type AnalysisDomain,
  type Finding,
  type FindingMeasurement,
  type FindingRunSample,
  type FindingStatus,
} from "../../domain/analysis";
import type { EvidenceIdentity, EvidenceLevel } from "../../domain/evidence";
import type { SemanticIdentity } from "./identity";
import { compareAscii, stableToken } from "../../lib/stable";
import type { SemanticMatchStatus } from "./matching";
import {
  calculateCohortStatistics,
  MEDIAN_MAD_POLICY,
} from "./statistics";

export interface FindingCandidate {
  identity: SemanticIdentity | null;
  semanticKey?: string;
  title: string;
  domain: AnalysisDomain;
  unit: FindingMeasurement["unit"];
  matchStatus: SemanticMatchStatus;
  baselineRuns: readonly FindingRunSample[];
  candidateRuns: readonly FindingRunSample[];
  evidenceIds: readonly EvidenceIdentity[];
  evidenceLevel?: EvidenceLevel;
}

export interface RankedFinding {
  finding: Finding;
  score: number;
  runSamples: {
    baseline: readonly FindingRunSample[];
    candidate: readonly FindingRunSample[];
  };
  identity: SemanticIdentity | null;
}

export function rankFindings(candidates: readonly FindingCandidate[]): RankedFinding[] {
  return candidates
    .map(buildRankedFinding)
    .sort((left, right) =>
      right.score - left.score ||
      compareAscii(left.finding.semanticIdentity, right.finding.semanticIdentity));
}

export async function rankFindingsInterruptibly(
  candidates: readonly FindingCandidate[],
  checkpoint: (completed: number, total: number) => Promise<void>,
): Promise<RankedFinding[]> {
  const findings: RankedFinding[] = [];
  for (const [index, candidate] of candidates.entries()) {
    findings.push(buildRankedFinding(candidate));
    await checkpoint(index + 1, candidates.length);
  }
  return findings.sort(compareRankedFindings);
}

function compareRankedFindings(left: RankedFinding, right: RankedFinding): number {
  return right.score - left.score ||
    compareAscii(left.finding.semanticIdentity, right.finding.semanticIdentity);
}

function buildRankedFinding(candidate: FindingCandidate): RankedFinding {
  const semanticKey = candidate.identity?.key ?? candidate.semanticKey;
  if (!semanticKey) throw new Error("Unmatched findings require a semantic fallback key");
  const quality = candidate.identity?.evidenceQuality ?? "unmatched";
  const statistics = calculateCohortStatistics({
    unit: candidate.unit,
    baselineRuns: candidate.baselineRuns,
    candidateRuns: candidate.candidateRuns,
    evidenceQuality: quality,
    completeIdentity: candidate.matchStatus === "matched" &&
      candidate.identity?.complete === true,
  });
  const status: FindingStatus = candidate.matchStatus === "matched"
    ? statistics.promotion.eligible ? "regression" : "inconclusive"
    : candidate.matchStatus;
  return {
    finding: {
      version: 1,
      id: findingId(`finding:v1:${candidate.domain}-${stableToken(semanticKey)}`),
      domain: candidate.domain,
      semanticIdentity: semanticKey,
      title: candidate.title,
      status,
      measurement: statistics.measurement,
      evidenceLevel: candidate.evidenceLevel ?? "derived-association",
      evidenceQuality: statistics.evidenceQuality,
      promotion: statistics.promotion,
      missingness: statistics.missingness,
      availability: statistics.availability,
      evidenceIds: candidate.evidenceIds,
      derivation: {
        version: MEDIAN_MAD_POLICY.id,
        parameters: {
          normalConsistencyScale: MEDIAN_MAD_POLICY.normalConsistencyScale,
          dispersionRule: "maximum-of-baseline-and-candidate-scaled-mad",
          promotionDispersionMultiplier:
            MEDIAN_MAD_POLICY.promotionDispersionMultiplier,
          unitFloor: MEDIAN_MAD_POLICY.unitFloors[candidate.unit],
          evidenceQualityWeight: statistics.evidenceQuality.weight,
        },
      },
    },
    score: statistics.score,
    runSamples: {
      baseline: candidate.baselineRuns,
      candidate: candidate.candidateRuns,
    },
    identity: candidate.identity,
  };
}
