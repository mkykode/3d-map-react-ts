import type { SessionId } from "../../domain/analysis";
import { compareAscii } from "../../lib/stable";
import type { CanonicalEventRecord } from "../adapter";
import { CATEGORIES, classifyEvent } from "../categories";
import type { DomainCollector, InterruptibleDomainCollector, RunValue } from "./candidateCollector";
import {
  overlapDuration,
  overlaps,
  visitItems,
  visitItemsInterruptibly,
} from "./collectorAdapters";
import { semanticIdentity } from "./identity";
import type { SemanticEntity } from "./matching";

type BrowserState = Map<string, {
  identity: ReturnType<typeof semanticIdentity>;
  value: number;
  eventKeys: string[];
}>;

export const collectBrowserValues: DomainCollector = (evidence, bounds, sessionId) => {
  const state: BrowserState = new Map();
  visitItems(evidence.events, (event) => accumulateBrowserEvent(state, event, bounds));
  return finishBrowserValues(state, sessionId);
};

export const collectBrowserValuesInterruptibly: InterruptibleDomainCollector = async (
  evidence,
  bounds,
  sessionId,
  checkpoint,
) => {
  const state: BrowserState = new Map();
  await visitItemsInterruptibly(
    evidence.events,
    (event) => accumulateBrowserEvent(state, event, bounds),
    checkpoint,
  );
  return finishBrowserValues(state, sessionId);
};

function accumulateBrowserEvent(
  state: BrowserState,
  event: CanonicalEventRecord,
  bounds: readonly [number, number],
): void {
  if (isScenarioMarker(event) || !overlaps(event.startMs, event.durationMs, bounds)) return;
  const category = CATEGORIES[classifyEvent(event.name, event.category)];
  const identity = semanticIdentity({ kind: "browser-domain", domain: category.key });
  const current = state.get(identity.key) ?? { identity, value: 0, eventKeys: [] };
  current.value += overlapDuration(
    event.startMs,
    event.startMs + Math.max(0, event.durationMs),
    bounds,
  );
  current.eventKeys.push(event.key);
  state.set(identity.key, current);
}

function finishBrowserValues(
  state: BrowserState,
  sessionId: SessionId,
): SemanticEntity<RunValue>[] {
  return [...state.values()].map((entry) => ({
    occurrenceKey: sessionId,
    identity: entry.identity,
    value: {
      sessionId,
      value: entry.value,
      eventKeys: [...new Set(entry.eventKeys)].sort(compareAscii),
    },
  }));
}

function isScenarioMarker(event: CanonicalEventRecord): boolean {
  if (!isRecord(event.data.args)) return false;
  const data = event.data.args.data;
  return isRecord(data) && typeof data.scenario === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
