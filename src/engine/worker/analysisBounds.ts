import type { AnalysisScope, ScenarioSelection } from "../../domain/analysis";
import type { CanonicalSessionData } from "./sessionRepository";

export type AnalysisBounds = readonly [startMs: number, endMs: number];

export function resolveAnalysisBounds(
  canonical: CanonicalSessionData,
  scope: AnalysisScope,
): AnalysisBounds | null {
  const scenario = resolveScenarioBounds(canonical, scope.scenario);
  if (!scenario) return null;
  if (!scope.timeWindowMs) return scenario;
  const startMs = Math.max(scenario[0], scope.timeWindowMs[0]);
  const endMs = Math.min(scenario[1], scope.timeWindowMs[1]);
  return endMs > startMs ? [startMs, endMs] : null;
}

export function resolveScenarioBounds(
  canonical: CanonicalSessionData,
  scenario: ScenarioSelection,
): AnalysisBounds | null {
  if (!isRecord(canonical.evidence)) return null;
  if (scenario.kind === "navigation") {
    const navigations = canonical.evidence.navigations;
    if (!Array.isArray(navigations)) return null;
    for (const navigation of navigations) {
      if (
        isRecord(navigation) &&
        navigation.id === scenario.navigationId &&
        isFiniteNumber(navigation.start) &&
        isFiniteNumber(navigation.end) &&
        navigation.end > navigation.start
      ) {
        return [navigation.start, navigation.end];
      }
    }
    return null;
  }

  const events = canonical.evidence.events;
  if (!Array.isArray(events)) return null;
  const orderedEvents = events
    .filter((event): event is Record<string, unknown> & {
      startMs: number;
      durationMs: number;
    } =>
      isRecord(event) &&
      isFiniteNumber(event.startMs) &&
      isFiniteNumber(event.durationMs)
    )
    .sort((left, right) => left.startMs - right.startMs);
  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;
  let previousScenario: string | null = null;
  const occurrences = new Map<string, number>();
  for (const event of orderedEvents) {
    const tag = scenarioTag(event.data);
    if (!tag) continue;
    if (tag.name !== previousScenario) {
      occurrences.set(tag.name, (occurrences.get(tag.name) ?? 0) + 1);
    }
    previousScenario = tag.name;
    const occurrence = tag.occurrence ?? occurrences.get(tag.name) ?? 1;
    if (tag.name !== scenario.markerName || occurrence !== scenario.occurrence) continue;
    startMs = Math.min(startMs, event.startMs);
    endMs = Math.max(endMs, event.startMs + Math.max(0, event.durationMs));
  }
  return Number.isFinite(startMs) && endMs > startMs ? [startMs, endMs] : null;
}

function scenarioTag(
  value: unknown,
): { name: string; occurrence: number | null } | null {
  if (!isRecord(value)) return null;
  const args = value.args;
  if (!isRecord(args)) return null;
  const data = args.data;
  if (!isRecord(data) || typeof data.scenario !== "string") return null;
  const occurrence = Number.isSafeInteger(data.scenarioOccurrence) &&
      (data.scenarioOccurrence as number) > 0
    ? data.scenarioOccurrence
    : null;
  return { name: data.scenario, occurrence: occurrence as number | null };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
