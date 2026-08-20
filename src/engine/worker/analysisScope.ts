import type { AnalysisScope } from "../../domain/analysis";
import { sameOrderedValues } from "../../lib/stable";
import type { ExperimentManifest } from "../experimentContract";
import type { ExperimentAnalysisResult } from "./analysisResult";

export function assertCompatibleManifest(
  manifest: ExperimentManifest,
  scope: AnalysisScope,
): void {
  if (manifest.state !== "ready" || !manifest.scope) {
    throw new Error("Experiment compatibility is blocked");
  }
  if (
    !sameOrderedValues(manifest.scope.baselineSessionIds, scope.baselineSessionIds) ||
    !sameOrderedValues(manifest.scope.candidateSessionIds, scope.candidateSessionIds) ||
    JSON.stringify(manifest.scope.scenario) !== JSON.stringify(scope.scenario)
  ) {
    throw new Error("Analysis scope does not match the compatible experiment manifest");
  }
}

export function experimentAnalysisMatchesScope(
  analysis: ExperimentAnalysisResult,
  scope: AnalysisScope,
): boolean {
  return sameOrderedValues(analysis.scope.baselineSessionIds, scope.baselineSessionIds) &&
    sameOrderedValues(analysis.scope.candidateSessionIds, scope.candidateSessionIds) &&
    JSON.stringify(analysis.scope.scenario) === JSON.stringify(scope.scenario) &&
    JSON.stringify(analysis.scope.timeWindowMs) === JSON.stringify(scope.timeWindowMs) &&
    sameOrderedValues(analysis.scope.domains, scope.domains);
}
