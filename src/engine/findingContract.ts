import type {
  AnalysisDomain,
  AnalysisScope,
  Finding,
  FindingId,
  FindingMeasurement,
  FindingStatus,
  SessionId,
} from "../domain/analysis";
import type {
  EvidenceAvailability,
  EvidenceIdentity,
  EvidenceLevel,
  EvidenceSlice,
} from "../domain/evidence";
import type { SourcePosition } from "../source/sourcePosition";

export interface SourceIdentity {
  version: 1;
  kind: "authored" | "generated" | "inline";
  key: string;
  functionName: string;
  position: SourcePosition;
  generatedPosition: SourcePosition;
}

export interface SourceSnippet extends SourcePosition {
  availability: EvidenceAvailability;
  provenance: "embedded-resource" | "source-map" | "unavailable";
  snippet: string | null;
  highlightedLine: string | null;
}

export interface TracerSourceResult {
  identity: SourceIdentity;
  generated: SourceSnippet;
  authored: SourceSnippet | null;
  mappingState:
    | "not-requested"
    | "mapped"
    | "missing"
    | "malformed"
    | "stale"
    | "ambiguous"
    | "blocked"
    | "security-limit";
  mappingFailure: EvidenceAvailability | null;
}

export interface ProvenanceRun {
  cohort: "baseline" | "candidate";
  sessionId: SessionId;
  importSha256: string;
  payloadSha256: string;
  eventKeys: readonly string[];
  value: number | null;
  evidenceLabel: EvidenceLevel;
  evidenceState: "observed" | "unknown";
}

export interface FindingSourceProvenance {
  identity: SourceIdentity;
  mappingState: TracerSourceResult["mappingState"];
  mappingFailure: EvidenceAvailability | null;
  generatedPosition: SourcePosition;
  authoredPosition: SourcePosition | null;
}

export interface FindingProvenance {
  version: 1;
  findingId: FindingId;
  domain: AnalysisDomain;
  semanticIdentity: string;
  scope: {
    baselineSessionIds: readonly SessionId[];
    candidateSessionIds: readonly SessionId[];
    scenario: AnalysisScope["scenario"];
    timeWindowMs: AnalysisScope["timeWindowMs"];
    domains: AnalysisScope["domains"];
  };
  runs: readonly ProvenanceRun[];
  source: FindingSourceProvenance | null;
  derivation: {
    version: string;
    parameters: Readonly<Record<string, unknown>>;
  };
}

export interface CpuSourceProvenance extends FindingProvenance {
  source: FindingSourceProvenance;
}

export interface FindingDetail {
  version: 1;
  finding: Finding;
  provenance: FindingProvenance;
  byteLength: number;
}

export interface FindingProjectionMark {
  findingId: FindingId;
  evidenceId: EvidenceIdentity;
  rank: number;
  domainRank: number;
  domain: AnalysisDomain;
  title: string;
  status: FindingStatus;
  unit: FindingMeasurement["unit"];
  magnitudeRatio: number;
}

export interface FindingProjection {
  version: 1;
  layout: "ranked-findings-grid-v1";
  scenario: AnalysisScope["scenario"];
  marks: readonly FindingProjectionMark[];
  byteLength: number;
}

export interface RegressionMark {
  findingId: FindingId;
  evidenceId: EvidenceIdentity;
  contributorId: string;
  kind: "cpu" | "gpu" | "network" | "frame" | "request" | "metric" | "source";
  domain: AnalysisDomain;
  semanticIdentity: string;
  title: string;
  unit: FindingMeasurement["unit"];
  scaleId: string;
  baselineValue: number | null;
  candidateValue: number | null;
  absoluteDelta: number | null;
  status: FindingStatus;
  availability: Finding["availability"];
  gap: null | {
    state: "gap";
    reason: "missing-contributor" | "unsupported-join" | "unavailable";
    detail: string;
  };
  position: readonly [x: number, y: number, z: number];
  size: readonly [width: number, height: number, depth: number];
}

export interface RegressionScale {
  id: string;
  kind: "linear";
  markKind: RegressionMark["kind"];
  unit: FindingMeasurement["unit"];
  label: string;
  maxAbsoluteDelta: number;
}

export interface RegressionProjection {
  version: 1;
  layout: "multi-domain-regression-v1";
  scenario: AnalysisScope["scenario"];
  marks: readonly RegressionMark[];
  scales: Readonly<Record<string, RegressionScale>>;
  contributors: Readonly<
    Record<string, { findingId: FindingId; evidenceId: EvidenceIdentity }>
  >;
  edges: readonly [];
  byteLength: number;
}

export interface CpuSourceContributor {
  sessionId: SessionId;
  valueMs: number | null;
  eventKeys: readonly string[];
}

export interface CpuSourceEvidencePayload {
  finding: Finding;
  contributors: {
    baseline: readonly CpuSourceContributor[];
    candidate: readonly CpuSourceContributor[];
  };
  source: {
    sessionId: SessionId;
    cohort: "baseline" | "candidate";
    identity: SourceIdentity;
    mappingState: TracerSourceResult["mappingState"];
    mappingFailure: EvidenceAvailability | null;
    authoredFallbackUsed: boolean;
    generated: SourceSnippet;
    authored: SourceSnippet;
  };
  provenance: CpuSourceProvenance;
}

export interface CpuSourceEvidenceSlice extends Omit<EvidenceSlice, "payload"> {
  payload: CpuSourceEvidencePayload;
}

export interface ExactContributor {
  cohort: "baseline" | "candidate";
  sessionId: SessionId;
  value: number | null;
  eventKeys: readonly string[];
  evidenceState: "observed" | "unknown";
}

export interface ExactTimelineItem {
  cohort: "baseline" | "candidate";
  sessionId: SessionId;
  eventKey: string;
  label: string;
  startMs: number;
  endMs: number;
  unit: "ms";
}

export interface ExactTimelineGap {
  sessionId: SessionId;
  eventKey: string;
  reason: "missing-event";
}

export interface ExactEvidenceTableRow extends ExactContributor {
  unit: FindingMeasurement["unit"];
}

export interface ExactScreenshot {
  cohort: "baseline" | "candidate";
  sessionId: SessionId;
  ts: number;
  dataUri: string;
}

export interface FindingEvidencePayload {
  finding: Finding;
  contributorId: string;
  requested: readonly (
    | "contributors"
    | "timeline"
    | "table"
    | "screenshots"
    | "provenance"
  )[];
  sections: {
    contributors?: readonly ExactContributor[];
    timeline?: {
      items: readonly ExactTimelineItem[];
      gaps: readonly ExactTimelineGap[];
    };
    table?: readonly ExactEvidenceTableRow[];
    screenshots?: readonly ExactScreenshot[];
    provenance?: FindingProvenance;
  };
}

export interface FindingEvidenceSlice extends Omit<EvidenceSlice, "payload"> {
  payload: FindingEvidencePayload;
}
