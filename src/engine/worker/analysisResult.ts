import type { AnalysisScope, Finding, FindingId } from "../../domain/analysis";
import type { ExperimentManifest } from "../experimentContract";
import type {
  FindingProvenance,
  FindingSourceProvenance,
} from "../findingContract";
import type { CpuSourceFinding } from "./cpuSourceAnalysis";
import type { CpuSourceMeasurement } from "./measurements";
import { buildFindingProvenance } from "./provenance";
import type { RankedFinding } from "./rankFindings";
import { encodedJsonBytes } from "./serialization";
import type { CanonicalSessionSource } from "./sessionRepository";

export interface ExperimentAnalysisResult {
  scope: AnalysisScope;
  compatibility: {
    state: "ready";
    issues: ExperimentManifest["issues"];
  };
  findings: readonly Finding[];
  rankedFindings: readonly RankedFinding[];
  sourceByFindingId: ReadonlyMap<FindingId, FindingSourceProvenance>;
  provenanceByFindingId: ReadonlyMap<FindingId, FindingProvenance>;
  cpuSourceByFindingId: ReadonlyMap<FindingId, CpuSourceFinding>;
  byteLength: number;
}

interface FinalizationInput {
  source: CanonicalSessionSource;
  manifest: ExperimentManifest;
  scope: AnalysisScope;
  rankedFindings: readonly RankedFinding[];
  sourceBySemanticKey: ReadonlyMap<string, FindingSourceProvenance>;
  cpuMeasurementBySemanticKey: ReadonlyMap<string, CpuSourceMeasurement>;
  maxBytes: number;
}

export function finalizeAnalysis(input: FinalizationInput): ExperimentAnalysisResult {
  const finalizer = createAnalysisFinalizer(input);
  for (const result of input.rankedFindings) finalizer.add(result);
  return finalizer.finish();
}

export async function finalizeAnalysisInterruptibly(
  input: FinalizationInput,
  checkpoint: (completed: number, total: number) => Promise<void>,
): Promise<ExperimentAnalysisResult> {
  const finalizer = createAnalysisFinalizer(input);
  for (const [index, result] of input.rankedFindings.entries()) {
    finalizer.add(result);
    await checkpoint(index + 1, input.rankedFindings.length);
  }
  return finalizer.finish();
}

function createAnalysisFinalizer(input: FinalizationInput) {
  const sourceByFindingId = new Map<FindingId, FindingSourceProvenance>();
  const provenanceByFindingId = new Map<FindingId, FindingProvenance>();
  const cpuSourceByFindingId = new Map<FindingId, CpuSourceFinding>();
  return {
    add(result: RankedFinding): void {
      const sourceProvenance = input.sourceBySemanticKey.get(
        result.finding.semanticIdentity,
      );
      if (sourceProvenance) sourceByFindingId.set(result.finding.id, sourceProvenance);
      const measurement = input.cpuMeasurementBySemanticKey.get(
        result.finding.semanticIdentity,
      );
      if (measurement) {
        cpuSourceByFindingId.set(result.finding.id, {
          finding: result.finding,
          score: result.score,
          source: measurement.source,
          measurements: measurement,
          scope: input.scope,
        });
      }
      provenanceByFindingId.set(
        result.finding.id,
        buildFindingProvenance(
          result,
          input.scope,
          input.source,
          sourceProvenance ?? null,
        ),
      );
    },
    finish(): ExperimentAnalysisResult {
      return createAnalysisResult(
        input,
        sourceByFindingId,
        provenanceByFindingId,
        cpuSourceByFindingId,
      );
    },
  };
}

function createAnalysisResult(
  input: FinalizationInput,
  sourceByFindingId: ReadonlyMap<FindingId, FindingSourceProvenance>,
  provenanceByFindingId: ReadonlyMap<FindingId, FindingProvenance>,
  cpuSourceByFindingId: ReadonlyMap<FindingId, CpuSourceFinding>,
): ExperimentAnalysisResult {
  const findings = input.rankedFindings.map((result) => result.finding);
  const compatibility = { state: "ready" as const, issues: input.manifest.issues };
  const byteLength = encodedJsonBytes({ compatibility, findings });
  if (byteLength > input.maxBytes) {
    throw new Error(`Finding summary byte limit exceeded: ${byteLength} > ${input.maxBytes}`);
  }
  return {
    scope: {
      ...input.scope,
      baselineSessionIds: [...input.scope.baselineSessionIds],
      candidateSessionIds: [...input.scope.candidateSessionIds],
      domains: [...input.scope.domains],
    },
    compatibility,
    findings,
    rankedFindings: input.rankedFindings,
    sourceByFindingId,
    provenanceByFindingId,
    cpuSourceByFindingId,
    byteLength,
  };
}
