import type { ScenarioSelection, SessionId } from "../../domain/analysis";
import {
  PHASE5_ANALYSIS_DOMAINS,
  type CaptureContextDifference,
  type CaptureContextField,
  type ExperimentIssue,
  type ExperimentManifest,
  type ExperimentManifestInput,
  type ExperimentRunManifest,
} from "../experimentContract";
import { ENGINE_LIMITS } from "../limits";
import { resolveScenarioBounds } from "./analysisBounds";
import type {
  CanonicalSessionData,
  CanonicalSessionSource,
  SessionSnapshot,
} from "./sessionRepository";

export interface ExperimentManifestSource extends CanonicalSessionSource {
  readonly accounting: {
    retainedBytes: number;
    inFlightBytes: number;
    totalBytes: number;
  };
  get(id: SessionId): SessionSnapshot;
}

const CAPTURE_CONTEXT_FIELDS: readonly CaptureContextField[] = [
  "browserContext",
  "throttling",
  "navigationOwnership",
];

export function buildExperimentManifest(
  source: ExperimentManifestSource,
  input: ExperimentManifestInput,
): ExperimentManifest {
  const issues: ExperimentIssue[] = [];
  assertCardinality("baseline", input.baselineSessionIds, issues);
  assertCardinality("candidate", input.candidateSessionIds, issues);

  const allIds = [...input.baselineSessionIds, ...input.candidateSessionIds];
  const duplicateIds = allIds.filter((id, index) => allIds.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    issues.push({
      code: "duplicate-session",
      detail: "Each session may appear only once in an experiment",
      sessionIds: [...new Set(duplicateIds)],
    });
  }
  if (source.accounting.totalBytes > ENGINE_LIMITS.aggregateRetainedAndInFlightBytes) {
    issues.push({
      code: "aggregate-memory",
      detail: "Experiment exceeds the aggregate retained and in-flight memory limit",
      sessionIds: allIds,
    });
  }

  const accepted = new Set(input.acceptedDifferences);
  const domains = input.domains?.length
    ? [...new Set(input.domains)]
    : [...PHASE5_ANALYSIS_DOMAINS];
  const runData = allIds.map((id, index) => {
    const snapshot = source.get(id);
    const canonical = snapshot.state === "ready"
      ? source.getCanonicalForWorker(id)
      : null;
    const cohort = index < input.baselineSessionIds.length
      ? "baseline" as const
      : "candidate" as const;
    return { id, snapshot, canonical, cohort };
  });

  const notReady = runData
    .filter((run) => run.snapshot.state !== "ready")
    .map((run) => run.id);
  if (notReady.length > 0) {
    issues.push({
      code: "session-not-ready",
      detail: "Every experiment run must finish canonicalization before ranking",
      sessionIds: notReady,
    });
  }

  const missingScenario = runData
    .filter((run) => !run.canonical || !hasScenario(run.canonical, input.scenario))
    .map((run) => run.id);
  if (missingScenario.length > 0) {
    issues.push({
      code: "scenario-missing",
      detail: scenarioMissingDetail(input.scenario),
      sessionIds: missingScenario,
    });
  }

  const differences = CAPTURE_CONTEXT_FIELDS.flatMap((field) => {
    const values = groupedCaptureValues(runData, field);
    const missing = values.find((value) => value.value === "unknown");
    if (missing) {
      issues.push({
        code: "capture-context",
        detail: `Capture context is missing for ${field}`,
        sessionIds: missing.sessionIds,
      });
    }
    if (values.length <= 1) return [];
    const difference: CaptureContextDifference = {
      field,
      values,
      accepted: accepted.has(field),
    };
    if (!difference.accepted) {
      issues.push({
        code: "capture-context",
        detail: `Capture context differs for ${field}`,
        sessionIds: values.flatMap((value) => value.sessionIds),
      });
    }
    return [difference];
  });

  const runs: ExperimentRunManifest[] = runData.map((run, index) => ({
    sessionId: run.id,
    cohort: run.cohort,
    label: `${run.cohort} ${indexInCohort(index, input.baselineSessionIds.length)}`,
    state: run.snapshot.state,
    retainedBytes: run.snapshot.retainedBytes,
    importSha256: run.canonical?.importSha256 ?? null,
    payloadSha256: run.canonical?.payloadSha256 ?? null,
    scenarioAvailable: Boolean(run.canonical && hasScenario(run.canonical, input.scenario)),
  }));
  const scope = issues.length === 0
    ? {
        version: 1 as const,
        baselineSessionIds: input.baselineSessionIds,
        candidateSessionIds: input.candidateSessionIds,
        scenario: input.scenario,
        timeWindowMs: null,
        domains,
        selectedFindingId: null,
        selectedEvidenceId: null,
      }
    : null;

  return {
    version: 1,
    state: issues.length === 0 ? "ready" : "blocked",
    scope,
    runs,
    issues,
    differences,
    acceptedDifferences: [...accepted],
    coverage: {
      baselineRuns: input.baselineSessionIds.length,
      candidateRuns: input.candidateSessionIds.length,
      readyRuns: runs.filter((run) => run.state === "ready").length,
      scenarioRuns: runs.filter((run) => run.scenarioAvailable).length,
      hashRuns: runs.filter((run) => run.importSha256 && run.payloadSha256).length,
    },
    memory: {
      ...source.accounting,
      limitBytes: ENGINE_LIMITS.aggregateRetainedAndInFlightBytes,
    },
  };
}

function assertCardinality(
  cohort: "baseline" | "candidate",
  ids: readonly SessionId[],
  issues: ExperimentIssue[],
): void {
  if (
    ids.length >= ENGINE_LIMITS.minRunsPerCohort &&
    ids.length <= ENGINE_LIMITS.maxRunsPerCohort
  ) {
    return;
  }
  const label = cohort === "baseline" ? "Baseline" : "Candidate";
  issues.push({
    code: `${cohort}-cardinality`,
    detail: `${label} cohort must contain 3 to 5 runs`,
    sessionIds: [],
  });
}

function hasScenario(
  canonical: CanonicalSessionData,
  scenario: ScenarioSelection,
): boolean {
  return resolveScenarioBounds(canonical, scenario) !== null;
}

function scenarioMissingDetail(scenario: ScenarioSelection): string {
  return scenario.kind === "marker"
    ? `Selected scenario marker ${scenario.markerName} is not present in every run`
    : `Selected navigation ${scenario.navigationId} is not owned by every run`;
}

function groupedCaptureValues(
  runs: readonly {
    id: SessionId;
    canonical: CanonicalSessionData | null;
  }[],
  field: CaptureContextField,
): { value: string; sessionIds: SessionId[] }[] {
  const grouped = new Map<string, SessionId[]>();
  for (const run of runs) {
    const captureContext = run.canonical
      ? recordValue(run.canonical.metadata.captureContext)
      : null;
    const value = captureContext?.[field];
    const normalized = typeof value === "string" && value ? value : "unknown";
    const sessionIds = grouped.get(normalized) ?? [];
    sessionIds.push(run.id);
    grouped.set(normalized, sessionIds);
  }
  return [...grouped].map(([value, sessionIds]) => ({ value, sessionIds }));
}

function indexInCohort(index: number, baselineCount: number): number {
  return index < baselineCount ? index + 1 : index - baselineCount + 1;
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
