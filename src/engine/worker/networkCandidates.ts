import { compareAscii } from "../../lib/stable";
import type { AdapterCanonicalEvidence } from "../adapter";
import type { DomainCollector, InterruptibleDomainCollector, RunValue } from "./candidateCollector";
import {
  overlapDuration,
  overlaps,
  visitItems,
  visitItemsInterruptibly,
} from "./collectorAdapters";
import { semanticIdentity } from "./identity";
import type { SemanticEntity } from "./matching";

type NetworkState = {
  valid: Map<string, SemanticEntity<RunValue>>;
  unmatched: SemanticEntity<RunValue>[];
};

export const collectNetworkValues: DomainCollector = (evidence, bounds, sessionId) => {
  const state = networkState();
  visitItems(evidence.requests, (request, index) =>
    accumulateRequest(state, request, index, bounds, sessionId));
  return finishNetworkValues(state);
};

export const collectNetworkValuesInterruptibly: InterruptibleDomainCollector = async (
  evidence,
  bounds,
  sessionId,
  checkpoint,
) => {
  const state = networkState();
  await visitItemsInterruptibly(
    evidence.requests,
    (request, index) => accumulateRequest(state, request, index, bounds, sessionId),
    checkpoint,
  );
  return finishNetworkValues(state);
};

function networkState(): NetworkState {
  return { valid: new Map(), unmatched: [] };
}

function accumulateRequest(
  state: NetworkState,
  request: AdapterRequest,
  index: number,
  bounds: readonly [number, number],
  sessionId: RunValue["sessionId"],
): void {
  if (!overlaps(request.start, request.end - request.start, bounds)) return;
  const occurrenceKey = `${sessionId}:request-${index}`;
  const value = overlapDuration(request.start, request.end, bounds);
  try {
    const identity = semanticIdentity({
      kind: "request",
      method: request.method ?? null,
      url: request.url,
    });
    const current = state.valid.get(identity.key);
    if (current) {
      current.value.value += value;
      if (request.eventKey) {
        current.value.eventKeys = [...current.value.eventKeys, request.eventKey]
          .sort(compareAscii);
      }
      return;
    }
    state.valid.set(identity.key, {
      occurrenceKey,
      identity,
      value: { sessionId, value, eventKeys: request.eventKey ? [request.eventKey] : [] },
    });
  } catch {
    state.unmatched.push({
      occurrenceKey,
      identity: null,
      value: { sessionId, value, eventKeys: request.eventKey ? [request.eventKey] : [] },
    });
  }
}

function finishNetworkValues(state: NetworkState): SemanticEntity<RunValue>[] {
  return [...state.valid.values(), ...state.unmatched];
}

type AdapterRequest = AdapterCanonicalEvidence["requests"][number];
