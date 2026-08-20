import type { AnalysisScope, FindingRunSample, SessionId } from "../../domain/analysis";
import { evidenceIdentity } from "../../domain/evidence";
import { stableToken } from "../../lib/stable";
import type { AdapterCanonicalEvidence } from "../adapter";
import { resolveAnalysisBounds } from "./analysisBounds";
import type { CollectionCheckpoint } from "./collectorAdapters";
import {
  unionMatchSemanticEntities,
  unionMatchSemanticEntitiesInterruptibly,
  type SemanticEntity,
  type SemanticMatch,
} from "./matching";
import type { FindingCandidate } from "./rankFindings";
import type { CanonicalSessionSource } from "./sessionRepository";

export interface RunValue {
  sessionId: SessionId;
  value: number;
  eventKeys: string[];
}

export type DomainCollector = (
  evidence: AdapterCanonicalEvidence,
  bounds: readonly [number, number],
  sessionId: SessionId,
) => SemanticEntity<RunValue>[];

export type InterruptibleDomainCollector = (
  evidence: AdapterCanonicalEvidence,
  bounds: readonly [number, number],
  sessionId: SessionId,
  checkpoint: CollectionCheckpoint,
) => Promise<SemanticEntity<RunValue>[]>;

export type AnalysisCheckpoint = (
  stage: string,
  completed: number,
  total: number,
) => Promise<void>;

export function collectDomainCandidates(
  source: CanonicalSessionSource,
  scope: AnalysisScope,
  collect: DomainCollector,
  domain: FindingCandidate["domain"],
  unit: FindingCandidate["unit"],
): FindingCandidate[] {
  const bySession = new Map<SessionId, readonly SemanticEntity<RunValue>[]>();
  for (const sessionId of sessionIds(scope)) {
    const canonical = source.getCanonicalForWorker(sessionId);
    const bounds = requiredBounds(canonical, scope, sessionId);
    bySession.set(sessionId, collect(asEvidence(canonical.evidence), bounds, sessionId));
  }
  return matchesFor(bySession, scope).map((match) =>
    candidateForMatch(match, bySession, scope, domain, unit));
}

export async function collectDomainCandidatesInterruptibly(
  source: CanonicalSessionSource,
  scope: AnalysisScope,
  collect: InterruptibleDomainCollector,
  domain: FindingCandidate["domain"],
  unit: FindingCandidate["unit"],
  checkpoint: AnalysisCheckpoint,
): Promise<FindingCandidate[]> {
  const bySession = new Map<SessionId, readonly SemanticEntity<RunValue>[]>();
  for (const sessionId of sessionIds(scope)) {
    const canonical = source.getCanonicalForWorker(sessionId);
    const bounds = requiredBounds(canonical, scope, sessionId);
    bySession.set(sessionId, await collect(
      asEvidence(canonical.evidence),
      bounds,
      sessionId,
      (completed, total) => checkpoint(`collect:${domain}`, completed, total),
    ));
  }
  const matches = await unionMatchSemanticEntitiesInterruptibly(
    scope.baselineSessionIds.flatMap((id) => bySession.get(id) ?? []),
    scope.candidateSessionIds.flatMap((id) => bySession.get(id) ?? []),
    (completed, total) => checkpoint(`match:${domain}`, completed, total),
  );
  return matches.map((match) => candidateForMatch(match, bySession, scope, domain, unit));
}

function matchesFor(
  bySession: ReadonlyMap<SessionId, readonly SemanticEntity<RunValue>[]>,
  scope: AnalysisScope,
): SemanticMatch<RunValue>[] {
  return unionMatchSemanticEntities(
    scope.baselineSessionIds.flatMap((id) => bySession.get(id) ?? []),
    scope.candidateSessionIds.flatMap((id) => bySession.get(id) ?? []),
  );
}

function candidateForMatch(
  match: SemanticMatch<RunValue>,
  bySession: ReadonlyMap<SessionId, readonly SemanticEntity<RunValue>[]>,
  scope: AnalysisScope,
  domain: FindingCandidate["domain"],
  unit: FindingCandidate["unit"],
): FindingCandidate {
  const semanticKey = match.identity?.key ?? match.key;
  return {
    identity: match.identity,
    semanticKey,
    title: match.identity?.title ?? "Unmatched evidence",
    domain,
    unit,
    matchStatus: match.status,
    baselineRuns: match.identity
      ? runSamples(scope.baselineSessionIds, semanticKey, bySession)
      : unmatchedSamples(scope.baselineSessionIds, match.baseline),
    candidateRuns: match.identity
      ? runSamples(scope.candidateSessionIds, semanticKey, bySession)
      : unmatchedSamples(scope.candidateSessionIds, match.candidate),
    evidenceIds: [evidenceIdentity(`evidence:v1:${domain}-${stableToken(semanticKey)}`)],
  };
}

function unmatchedSamples(
  ids: readonly SessionId[],
  entities: readonly SemanticEntity<RunValue>[],
): FindingRunSample[] {
  return ids.map((sessionId) => {
    const entity = entities.find((entry) => entry.value.sessionId === sessionId);
    return {
      sessionId,
      value: entity?.value.value ?? null,
      eventKeys: entity?.value.eventKeys ?? [],
    };
  });
}

function runSamples(
  ids: readonly SessionId[],
  semanticKey: string,
  bySession: ReadonlyMap<SessionId, readonly SemanticEntity<RunValue>[]>,
): FindingRunSample[] {
  return ids.map((sessionId) => {
    const value = bySession.get(sessionId)?.find((entry) =>
      entry.identity?.key === semanticKey ||
      (!entry.identity && `unmatched:${entry.occurrenceKey}` === semanticKey));
    return {
      sessionId,
      value: value?.value.value ?? null,
      eventKeys: value?.value.eventKeys ?? [],
    };
  });
}

function sessionIds(scope: AnalysisScope): SessionId[] {
  return [...scope.baselineSessionIds, ...scope.candidateSessionIds];
}

function requiredBounds(
  canonical: Parameters<typeof resolveAnalysisBounds>[0],
  scope: AnalysisScope,
  sessionId: SessionId,
): readonly [number, number] {
  const bounds = resolveAnalysisBounds(canonical, scope);
  if (!bounds) throw new Error(`Analysis scenario is unavailable: ${sessionId}`);
  return bounds;
}

function asEvidence(value: unknown): AdapterCanonicalEvidence {
  if (!isRecord(value) || !Array.isArray(value.events)) {
    throw new Error("Canonical analysis evidence is unavailable");
  }
  return value as unknown as AdapterCanonicalEvidence;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
