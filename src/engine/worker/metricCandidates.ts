import { compareAscii } from "../../lib/stable";
import type { AdapterCanonicalEvidence } from "../adapter";
import type { DomainCollector, InterruptibleDomainCollector, RunValue } from "./candidateCollector";
import { visitItems, visitItemsInterruptibly } from "./collectorAdapters";
import { semanticIdentity } from "./identity";
import type { SemanticEntity } from "./matching";

type MetricState = Map<string, SemanticEntity<RunValue>>;

export const collectMetricValues: DomainCollector = (evidence, bounds, sessionId) => {
  const state: MetricState = new Map();
  visitItems(evidence.metrics, (metric, index) =>
    accumulateMetric(state, metric, index, bounds, sessionId));
  return [...state.values()];
};

export const collectMetricValuesInterruptibly: InterruptibleDomainCollector = async (
  evidence,
  bounds,
  sessionId,
  checkpoint,
) => {
  const state: MetricState = new Map();
  await visitItemsInterruptibly(
    evidence.metrics,
    (metric, index) => accumulateMetric(state, metric, index, bounds, sessionId),
    checkpoint,
  );
  return [...state.values()];
};

function accumulateMetric(
  state: MetricState,
  metric: AdapterCanonicalEvidence["metrics"][number],
  index: number,
  bounds: readonly [number, number],
  sessionId: RunValue["sessionId"],
): void {
  if (metric.ts < bounds[0] || metric.ts > bounds[1]) return;
  const identity = semanticIdentity({ kind: "metric", name: metric.label || metric.name });
  const value = metric.ts - bounds[0];
  const current = state.get(identity.key);
  if (current) {
    current.value.value = Math.max(current.value.value, value);
    if (metric.eventKey) {
      current.value.eventKeys = [...current.value.eventKeys, metric.eventKey]
        .sort(compareAscii);
    }
    return;
  }
  state.set(identity.key, {
    occurrenceKey: `${sessionId}:metric-${index}`,
    identity,
    value: { sessionId, value, eventKeys: metric.eventKey ? [metric.eventKey] : [] },
  });
}
