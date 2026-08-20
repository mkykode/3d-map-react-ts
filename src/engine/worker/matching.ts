import type { SemanticIdentity } from "./identity";
import { compareAscii } from "../../lib/stable";

export type SemanticMatchStatus = "matched" | "added" | "removed" | "unmatched";

export interface SemanticEntity<T> {
  occurrenceKey: string;
  identity: SemanticIdentity | null;
  value: T;
}

export interface SemanticMatch<T> {
  key: string;
  identity: SemanticIdentity | null;
  status: SemanticMatchStatus;
  baseline: readonly SemanticEntity<T>[];
  candidate: readonly SemanticEntity<T>[];
}

export function unionMatchSemanticEntities<T>(
  baseline: readonly SemanticEntity<T>[],
  candidate: readonly SemanticEntity<T>[],
): SemanticMatch<T>[] {
  const matched = new Map<string, {
    identity: SemanticIdentity;
    baseline: SemanticEntity<T>[];
    candidate: SemanticEntity<T>[];
  }>();
  const unmatched: SemanticMatch<T>[] = [];

  collect("baseline", baseline, matched, unmatched);
  collect("candidate", candidate, matched, unmatched);

  return finishMatches(matched, unmatched);
}

export async function unionMatchSemanticEntitiesInterruptibly<T>(
  baseline: readonly SemanticEntity<T>[],
  candidate: readonly SemanticEntity<T>[],
  checkpoint: (completed: number, total: number) => Promise<void>,
): Promise<SemanticMatch<T>[]> {
  const matched = new Map<string, {
    identity: SemanticIdentity;
    baseline: SemanticEntity<T>[];
    candidate: SemanticEntity<T>[];
  }>();
  const unmatched: SemanticMatch<T>[] = [];
  const cohorts = [
    ["baseline", baseline],
    ["candidate", candidate],
  ] as const;
  const total = baseline.length + candidate.length;
  let completed = 0;
  for (const [cohort, entities] of cohorts) {
    for (const entity of entities) {
      collect(cohort, [entity], matched, unmatched);
      await checkpoint(++completed, total);
    }
  }
  return finishMatches(matched, unmatched);
}

function finishMatches<T>(
  matched: Map<string, {
    identity: SemanticIdentity;
    baseline: SemanticEntity<T>[];
    candidate: SemanticEntity<T>[];
  }>,
  unmatched: SemanticMatch<T>[],
): SemanticMatch<T>[] {
  return [
    ...[...matched].map(([key, group]): SemanticMatch<T> => ({
      key,
      identity: group.identity,
      status:
        group.baseline.length > 0 && group.candidate.length > 0
          ? "matched"
          : group.candidate.length > 0
            ? "added"
            : "removed",
      baseline: group.baseline.sort(byOccurrenceKey),
      candidate: group.candidate.sort(byOccurrenceKey),
    })),
    ...unmatched,
  ].sort((left, right) => compareAscii(left.key, right.key));
}

function collect<T>(
  cohort: "baseline" | "candidate",
  entities: readonly SemanticEntity<T>[],
  matched: Map<string, {
    identity: SemanticIdentity;
    baseline: SemanticEntity<T>[];
    candidate: SemanticEntity<T>[];
  }>,
  unmatched: SemanticMatch<T>[],
): void {
  for (const entity of entities) {
    if (!entity.occurrenceKey) throw new Error("Semantic entity occurrence key is required");
    if (!entity.identity || !entity.identity.complete) {
      unmatched.push({
        key: `unmatched:${cohort}:${entity.occurrenceKey}`,
        identity: entity.identity,
        status: "unmatched",
        baseline: cohort === "baseline" ? [entity] : [],
        candidate: cohort === "candidate" ? [entity] : [],
      });
      continue;
    }
    const group = matched.get(entity.identity.key) ?? {
      identity: entity.identity,
      baseline: [],
      candidate: [],
    };
    group[cohort].push(entity);
    matched.set(entity.identity.key, group);
  }
}

function byOccurrenceKey<T>(left: SemanticEntity<T>, right: SemanticEntity<T>): number {
  return compareAscii(left.occurrenceKey, right.occurrenceKey);
}
