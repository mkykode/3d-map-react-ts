import type {
  EvidenceAvailability,
  EvidenceIdentity,
  EvidenceLevel,
} from "./evidence";

declare const opaqueId: unique symbol;

export type OpaqueId<Name extends string> = string & {
  readonly [opaqueId]: Name;
};

export type SessionId = OpaqueId<"SessionId.v1">;
export type AnalysisJobId = OpaqueId<"AnalysisJobId.v1">;
export type FindingId = OpaqueId<"FindingId.v1">;

const ID_PATTERN = /^[a-z][a-z-]*:v1:[A-Za-z0-9._-]+$/;

export function sessionId(value: string): SessionId {
  return opaqueIdentifier(value, "session") as SessionId;
}

export function analysisJobId(value: string): AnalysisJobId {
  return opaqueIdentifier(value, "job") as AnalysisJobId;
}

export function findingId(value: string): FindingId {
  return opaqueIdentifier(value, "finding") as FindingId;
}

function opaqueIdentifier(value: string, namespace: string): string {
  if (!ID_PATTERN.test(value) || !value.startsWith(`${namespace}:v1:`)) {
    throw new Error(`Invalid ${namespace} identifier`);
  }
  return value;
}

export type AnalysisDomain =
  | "cpu-source"
  | "browser"
  | "network"
  | "frame"
  | "metric"
  | "periodicity";

export type ScenarioSelection =
  | { kind: "navigation"; navigationId: string }
  | { kind: "marker"; markerName: string; occurrence: number };

export interface AnalysisScope {
  version: 1;
  baselineSessionIds: readonly SessionId[];
  candidateSessionIds: readonly SessionId[];
  scenario: ScenarioSelection;
  timeWindowMs: readonly [start: number, end: number] | null;
  domains: readonly AnalysisDomain[];
  selectedFindingId: FindingId | null;
  selectedEvidenceId: EvidenceIdentity | null;
}

export type AnalysisJob =
  | {
      version: 1;
      id: AnalysisJobId;
      kind: "parse" | "canonicalize";
      sessionId: SessionId;
    }
  | {
      version: 1;
      id: AnalysisJobId;
      kind: "cohort-scan" | "periodicity";
      scope: AnalysisScope;
    }
  | {
      version: 1;
      id: AnalysisJobId;
      kind: "projection" | "evidence-slice";
      scope: AnalysisScope;
      evidenceId?: EvidenceIdentity;
    };

export type FindingStatus =
  | "regression"
  | "improvement"
  | "inconclusive"
  | "added"
  | "removed"
  | "unmatched";

export type FindingEvidenceQualityClass =
  | "authored-source"
  | "generated-source"
  | "stable-non-source-identity"
  | "unmatched";

export type FindingPromotionReason =
  | "insufficient-samples"
  | "non-positive-effect"
  | "effect-within-dispersion"
  | "incomplete-identity";

export interface FindingMeasurement {
  unit: "ms" | "bytes" | "count" | "score";
  baseline: number | null;
  candidate: number | null;
  absoluteDelta: number | null;
  relativeDelta: number | null;
  dispersion: number | null;
  baselineSamples: number;
  candidateSamples: number;
  baselineCompleteness: number;
  candidateCompleteness: number;
}

export interface FindingRunSample {
  sessionId: SessionId;
  value: number | null;
  eventKeys: readonly string[];
}

export interface Finding {
  version: 1;
  id: FindingId;
  domain: AnalysisDomain;
  semanticIdentity: string;
  title: string;
  status: FindingStatus;
  measurement: FindingMeasurement;
  evidenceLevel: EvidenceLevel;
  evidenceQuality: {
    class: FindingEvidenceQualityClass;
    weight: number;
  };
  promotion: {
    eligible: boolean;
    reasons: readonly FindingPromotionReason[];
  };
  missingness: {
    state: "complete" | "incomplete" | "unknown";
    baselineMissing: number;
    candidateMissing: number;
  };
  availability: EvidenceAvailability;
  evidenceIds: readonly EvidenceIdentity[];
  derivation: { version: string; parameters: Readonly<Record<string, unknown>> };
}

export function validateAnalysisScope(scope: AnalysisScope): void {
  assertCohort("baseline", scope.baselineSessionIds);
  assertCohort("candidate", scope.candidateSessionIds);
  if (
    scope.timeWindowMs &&
    (!Number.isFinite(scope.timeWindowMs[0]) ||
      !Number.isFinite(scope.timeWindowMs[1]) ||
      scope.timeWindowMs[0] < 0 ||
      scope.timeWindowMs[1] <= scope.timeWindowMs[0])
  ) {
    throw new Error("Analysis time window must be finite and increasing");
  }
}

function assertCohort(label: string, ids: readonly SessionId[]): void {
  if (ids.length < 3 || ids.length > 5) {
    throw new Error(`${label} cohort must contain 3 to 5 sessions`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} cohort contains duplicate sessions`);
  }
}
