import type {
  AnalysisDomain,
  AnalysisScope,
  ScenarioSelection,
  SessionId,
} from "../domain/analysis";

export type CaptureContextField =
  | "browserContext"
  | "throttling"
  | "navigationOwnership";

export type ExperimentIssueCode =
  | "baseline-cardinality"
  | "candidate-cardinality"
  | "duplicate-session"
  | "aggregate-memory"
  | "session-not-ready"
  | "scenario-missing"
  | "capture-context";

export interface ExperimentIssue {
  code: ExperimentIssueCode;
  detail: string;
  sessionIds: readonly SessionId[];
}

export interface ExperimentRunManifest {
  sessionId: SessionId;
  cohort: "baseline" | "candidate";
  label: string;
  state: "reserved" | "ingesting" | "canonicalizing" | "ready" | "canceled" | "disposed";
  retainedBytes: number;
  importSha256: string | null;
  payloadSha256: string | null;
  scenarioAvailable: boolean;
}

export interface CaptureContextDifference {
  field: CaptureContextField;
  values: readonly { value: string; sessionIds: readonly SessionId[] }[];
  accepted: boolean;
}

export interface ExperimentManifest {
  version: 1;
  state: "ready" | "blocked";
  scope: AnalysisScope | null;
  runs: readonly ExperimentRunManifest[];
  issues: readonly ExperimentIssue[];
  differences: readonly CaptureContextDifference[];
  acceptedDifferences: readonly CaptureContextField[];
  coverage: {
    baselineRuns: number;
    candidateRuns: number;
    readyRuns: number;
    scenarioRuns: number;
    hashRuns: number;
  };
  memory: {
    retainedBytes: number;
    inFlightBytes: number;
    totalBytes: number;
    limitBytes: number;
  };
}

export interface ExperimentManifestInput {
  baselineSessionIds: readonly SessionId[];
  candidateSessionIds: readonly SessionId[];
  scenario: ScenarioSelection;
  acceptedDifferences: readonly CaptureContextField[];
  domains?: readonly Phase5AnalysisDomain[];
}

export type Phase5AnalysisDomain = Exclude<AnalysisDomain, "periodicity">;

export const PHASE5_ANALYSIS_DOMAINS: readonly Phase5AnalysisDomain[] = [
  "cpu-source",
  "browser",
  "network",
  "frame",
  "metric",
];
