import type {
  AnalysisScope,
  Finding,
  FindingRunSample,
} from "../../domain/analysis";
import type {
  CpuSourceProvenance,
  FindingProvenance,
  FindingSourceProvenance,
  ProvenanceRun,
} from "../findingContract";
import type { SourcePosition } from "../../source/sourcePosition";
import type { CpuSourceFinding } from "./cpuSourceAnalysis";
import type { CanonicalSessionSource } from "./sessionRepository";
import type { RankedFinding } from "./rankFindings";

export type ProvenanceSessionSource = CanonicalSessionSource;

export function buildFindingProvenance(
  result: Pick<RankedFinding, "finding" | "runSamples">,
  scope: AnalysisScope,
  sessions: ProvenanceSessionSource,
  source: FindingSourceProvenance | null = null,
): FindingProvenance {
  return buildProvenance(
    result.finding,
    result.runSamples.baseline,
    result.runSamples.candidate,
    scope,
    sessions,
    source,
  );
}

export function buildCpuSourceProvenance(
  result: CpuSourceFinding,
  scope: AnalysisScope,
  sessions: ProvenanceSessionSource,
): CpuSourceProvenance {
  return buildProvenance(
    result.finding,
    result.measurements.baseline.runs.map((run) => ({
      ...run,
      value: run.valueMs,
    })),
    result.measurements.candidate.runs.map((run) => ({
      ...run,
      value: run.valueMs,
    })),
    scope,
    sessions,
    {
      identity: result.source.identity,
      mappingState: result.source.mappingState,
      mappingFailure: result.source.mappingFailure,
      generatedPosition: positionOf(result.source.generated),
      authoredPosition: result.source.authored
        ? positionOf(result.source.authored)
        : null,
    },
  ) as CpuSourceProvenance;
}

function buildProvenance(
  finding: Finding,
  baselineRuns: readonly FindingRunSample[],
  candidateRuns: readonly FindingRunSample[],
  scope: AnalysisScope,
  sessions: ProvenanceSessionSource,
  source: FindingSourceProvenance | null,
): FindingProvenance {
  return {
    version: 1,
    findingId: finding.id,
    domain: finding.domain,
    semanticIdentity: finding.semanticIdentity,
    scope: {
      baselineSessionIds: [...scope.baselineSessionIds],
      candidateSessionIds: [...scope.candidateSessionIds],
      scenario: scope.scenario,
      timeWindowMs: scope.timeWindowMs,
      domains: [...scope.domains],
    },
    runs: [
      ...provenanceRuns("baseline", baselineRuns, sessions),
      ...provenanceRuns("candidate", candidateRuns, sessions),
    ],
    source,
    derivation: {
      version: finding.derivation.version,
      parameters: finding.derivation.parameters,
    },
  };
}

function provenanceRuns(
  cohort: "baseline" | "candidate",
  runs: readonly FindingRunSample[],
  sessions: ProvenanceSessionSource,
): ProvenanceRun[] {
  return runs.map((run) => {
    const canonical = sessions.getCanonicalForWorker(run.sessionId);
    return {
      cohort,
      sessionId: run.sessionId,
      importSha256: canonical.importSha256,
      payloadSha256: canonical.payloadSha256,
      eventKeys: run.eventKeys,
      value: run.value,
      evidenceLabel: "trace-observation",
      evidenceState: run.value === null ? "unknown" : "observed",
    };
  });
}

function positionOf(value: SourcePosition): SourcePosition {
  return { url: value.url, line: value.line, column: value.column };
}
