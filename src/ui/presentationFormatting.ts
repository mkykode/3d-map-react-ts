import type { AnalysisScope } from "../domain/analysis";

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatScenario(scenario: AnalysisScope["scenario"]): string {
  return scenario.kind === "marker"
    ? `Scenario marker ${scenario.markerName}, occurrence ${scenario.occurrence}`
    : `Scenario navigation ${scenario.navigationId}`;
}
