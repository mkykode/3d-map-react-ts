import { compareAscii } from "../../lib/stable";
import type { AdapterCanonicalEvidence } from "../adapter";
import type { DomainCollector, InterruptibleDomainCollector, RunValue } from "./candidateCollector";
import { overlaps, visitItems, visitItemsInterruptibly } from "./collectorAdapters";
import { semanticIdentity } from "./identity";
import type { SemanticEntity } from "./matching";

type FrameState = Map<"presented" | "dropped", RunValue>;

export const collectFrameValues: DomainCollector = (evidence, bounds, sessionId) => {
  const state: FrameState = new Map();
  visitItems(evidence.frames, (frame) => accumulateFrame(state, frame, bounds, sessionId));
  return finishFrameValues(state, sessionId);
};

export const collectFrameValuesInterruptibly: InterruptibleDomainCollector = async (
  evidence,
  bounds,
  sessionId,
  checkpoint,
) => {
  const state: FrameState = new Map();
  await visitItemsInterruptibly(
    evidence.frames,
    (frame) => accumulateFrame(state, frame, bounds, sessionId),
    checkpoint,
  );
  return finishFrameValues(state, sessionId);
};

function accumulateFrame(
  state: FrameState,
  frame: AdapterCanonicalEvidence["frames"][number],
  bounds: readonly [number, number],
  sessionId: RunValue["sessionId"],
): void {
  if (!overlaps(frame.start, frame.end - frame.start, bounds)) return;
  const outcome = frame.dropped ? "dropped" : "presented";
  const current = state.get(outcome) ?? { sessionId, value: 0, eventKeys: [] };
  current.value += 1;
  if (frame.eventKey) {
    current.eventKeys = [...current.eventKeys, frame.eventKey].sort(compareAscii);
  }
  state.set(outcome, current);
}

function finishFrameValues(
  state: FrameState,
  sessionId: RunValue["sessionId"],
): SemanticEntity<RunValue>[] {
  return [...state].map(([outcome, value]) => ({
    occurrenceKey: `${sessionId}:frame-${outcome}`,
    identity: semanticIdentity({ kind: "frame-outcome", outcome }),
    value,
  }));
}
