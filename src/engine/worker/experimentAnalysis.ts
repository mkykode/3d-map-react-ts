import type { AnalysisScope } from "../../domain/analysis";
import type { ExperimentManifest } from "../experimentContract";
import type { FindingSourceProvenance } from "../findingContract";
import { ENGINE_LIMITS } from "../limits";
import {
  finalizeAnalysis,
  finalizeAnalysisInterruptibly,
  type ExperimentAnalysisResult,
} from "./analysisResult";
import { assertCompatibleManifest } from "./analysisScope";
import {
  collectBrowserValues,
  collectBrowserValuesInterruptibly,
} from "./browserCandidates";
import {
  collectDomainCandidates,
  collectDomainCandidatesInterruptibly,
  type DomainCollector,
  type InterruptibleDomainCollector,
} from "./candidateCollector";
import {
  collectCpuSourceCandidates,
  cpuCandidatesFromMeasurements,
} from "./cpuCandidates";
import {
  collectFrameValues,
  collectFrameValuesInterruptibly,
} from "./frameCandidates";
import type { JobContext } from "./jobController";
import {
  collectCpuSourceMeasurementsInterruptibly,
  type CpuSourceMeasurement,
} from "./measurements";
import {
  collectMetricValues,
  collectMetricValuesInterruptibly,
} from "./metricCandidates";
import {
  collectNetworkValues,
  collectNetworkValuesInterruptibly,
} from "./networkCandidates";
import {
  rankFindings,
  rankFindingsInterruptibly,
  type FindingCandidate,
} from "./rankFindings";
import type { CanonicalSessionSource } from "./sessionRepository";

type Domain = "browser" | "network" | "frame" | "metric";

interface DomainConfiguration {
  domain: Domain;
  unit: FindingCandidate["unit"];
  collect: DomainCollector;
  collectInterruptibly: InterruptibleDomainCollector;
}

const DOMAIN_CONFIGURATIONS: readonly DomainConfiguration[] = [
  {
    domain: "browser",
    unit: "ms",
    collect: collectBrowserValues,
    collectInterruptibly: collectBrowserValuesInterruptibly,
  },
  {
    domain: "network",
    unit: "ms",
    collect: collectNetworkValues,
    collectInterruptibly: collectNetworkValuesInterruptibly,
  },
  {
    domain: "frame",
    unit: "count",
    collect: collectFrameValues,
    collectInterruptibly: collectFrameValuesInterruptibly,
  },
  {
    domain: "metric",
    unit: "ms",
    collect: collectMetricValues,
    collectInterruptibly: collectMetricValuesInterruptibly,
  },
];

export function runExperimentAnalysis(
  source: CanonicalSessionSource,
  manifest: ExperimentManifest,
  scope: AnalysisScope,
  maxBytes = ENGINE_LIMITS.projectionBytes,
  onStage?: (stage: "compatibility" | "matching" | "statistics" | "ranking" | "provenance") => void,
): ExperimentAnalysisResult {
  assertCompatibleManifest(manifest, scope);
  onStage?.("compatibility");
  const candidates: FindingCandidate[] = [];
  const sourceBySemanticKey = new Map<string, FindingSourceProvenance>();
  const cpuMeasurementBySemanticKey = new Map<string, CpuSourceMeasurement>();
  if (scope.domains.includes("cpu-source")) {
    candidates.push(...collectCpuSourceCandidates(
      source,
      scope,
      sourceBySemanticKey,
      cpuMeasurementBySemanticKey,
    ));
  }
  for (const configuration of DOMAIN_CONFIGURATIONS) {
    if (!scope.domains.includes(configuration.domain)) continue;
    candidates.push(...collectDomainCandidates(
      source,
      scope,
      configuration.collect,
      configuration.domain,
      configuration.unit,
    ));
  }
  onStage?.("matching");
  onStage?.("statistics");
  const rankedFindings = rankFindings(candidates);
  onStage?.("ranking");
  const result = finalizeAnalysis({
    source,
    manifest,
    scope,
    rankedFindings,
    sourceBySemanticKey,
    cpuMeasurementBySemanticKey,
    maxBytes,
  });
  onStage?.("provenance");
  return result;
}

export async function runExperimentAnalysisJob(
  source: CanonicalSessionSource,
  manifest: ExperimentManifest,
  scope: AnalysisScope,
  context: JobContext,
  maxBytes = ENGINE_LIMITS.projectionBytes,
): Promise<ExperimentAnalysisResult> {
  assertCompatibleManifest(manifest, scope);
  const candidates: FindingCandidate[] = [];
  const sourceBySemanticKey = new Map<string, FindingSourceProvenance>();
  const cpuMeasurementBySemanticKey = new Map<string, CpuSourceMeasurement>();
  if (scope.domains.includes("cpu-source")) {
    const measurements = await collectCpuSourceMeasurementsInterruptibly(
      source,
      scope,
      (completed, total) => cooperate(context, "collect:cpu-source", completed, total),
    );
    candidates.push(...cpuCandidatesFromMeasurements(
      measurements,
      sourceBySemanticKey,
      cpuMeasurementBySemanticKey,
    ));
  }
  for (const configuration of DOMAIN_CONFIGURATIONS) {
    if (!scope.domains.includes(configuration.domain)) continue;
    candidates.push(...await collectDomainCandidatesInterruptibly(
      source,
      scope,
      configuration.collectInterruptibly,
      configuration.domain,
      configuration.unit,
      (stage, completed, total) => cooperate(context, stage, completed, total),
    ));
  }
  const rankedFindings = await rankFindingsInterruptibly(
    candidates,
    (completed, total) => cooperate(context, "rank", completed, total),
  );
  return finalizeAnalysisInterruptibly(
    {
      source,
      manifest,
      scope,
      rankedFindings,
      sourceBySemanticKey,
      cpuMeasurementBySemanticKey,
      maxBytes,
    },
    (completed, total) => cooperate(context, "provenance", completed, total),
  );
}

async function cooperate(
  context: JobContext,
  stage: string,
  completed: number,
  total: number,
): Promise<void> {
  context.throwIfCanceled();
  if (completed !== total && completed % 128 !== 0) return;
  context.progress(stage, completed, total);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  context.throwIfCanceled();
}
