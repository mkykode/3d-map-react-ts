import {
  parseTraceForSession,
  type AdapterCanonicalEvidence,
} from "../adapter";
import type { ParsedTraceModel } from "../types";
import {
  commitStagedEnvelope,
  type StagedFullEnvelope,
} from "./fullEnvelope";
import type { SessionId } from "../../domain/analysis";
import type {
  CanonicalSessionData,
  TraceSessionRepository,
} from "./sessionRepository";
import { encodedJsonBytes } from "./serialization";

export interface CanonicalTraceSession extends CanonicalSessionData {
  evidence: AdapterCanonicalEvidence;
  compatibilityProjection: ParsedTraceModel;
  provenance: {
    importSha256: string;
    payloadSha256: string;
    adapterVersion: 1;
  };
}

export async function canonicalizeTraceSession(
  stage: StagedFullEnvelope,
): Promise<CanonicalTraceSession> {
  const envelope = stage.envelope;
  const { projection, canonicalEvidence } = await parseTraceForSession(
    envelope.traceEvents,
    { window: envelope.visualizationWindow },
  );
  const sourceMaps = Object.entries(envelope.sourceMaps).map(([url, content]) => ({
    url,
    content,
  }));
  const scanIndexes = buildScanIndexes(canonicalEvidence);
  const retainedBytes = encodedJsonBytes(envelope.metadata) + encodedJsonBytes(envelope.settings) + estimateRetainedBytes(
    canonicalEvidence,
    projection,
    envelope.resources,
    sourceMaps,
  );

  return {
    importSha256: stage.importSha256,
    payloadSha256: stage.payloadSha256,
    metadata: envelope.metadata,
    settings: envelope.settings,
    evidence: canonicalEvidence,
    screenshots: canonicalEvidence.screenshots,
    resources: envelope.resources,
    sourceMaps,
    scanIndexes,
    retainedBytes,
    compatibilityProjection: projection,
    provenance: {
      importSha256: stage.importSha256,
      payloadSha256: stage.payloadSha256,
      adapterVersion: 1,
    },
  };
}

export function commitTraceSession(
  repository: TraceSessionRepository,
  stage: StagedFullEnvelope,
  canonical: CanonicalTraceSession,
): void {
  commitStagedEnvelope(repository, stage, canonical);
}

export function discardStagedTraceSession(
  repository: TraceSessionRepository,
  id: SessionId,
  stage?: StagedFullEnvelope,
): void {
  stage?.release();
  if (!repository.has(id)) return;
  const state = repository.get(id).state;
  if (state === "reserved" || state === "ingesting" || state === "canonicalizing") {
    repository.cancel(id);
  }
}

function buildScanIndexes(
  evidence: AdapterCanonicalEvidence,
): Readonly<Record<string, readonly number[]>> {
  const indexes: Record<string, number[]> = {};
  evidence.events.forEach((event, index) => {
    const key = `${event.processId}:${event.threadId}`;
    const entries = indexes[key] ?? [];
    entries.push(index);
    indexes[key] = entries;
  });
  return indexes;
}

function estimateRetainedBytes(
  evidence: AdapterCanonicalEvidence,
  projection: ParsedTraceModel,
  resources: readonly Readonly<Record<string, unknown>>[],
  sourceMaps: readonly Readonly<Record<string, unknown>>[],
): number {
  // Count bounded records without another whole-session string and byte buffer.
  const jsonBytes = Object.values(evidence).reduce<number>((total, value) =>
    total + (Array.isArray(value)
      ? value.reduce((sum, entry) => sum + encodedJsonBytes(entry) + 1, 2)
      : encodedJsonBytes(value)), 0) +
    resources.reduce((sum, entry) => sum + encodedJsonBytes(entry) + 1, 2) +
    sourceMaps.reduce((sum, entry) => sum + encodedJsonBytes(entry) + 1, 2);
  const projectionBuffers = projection.lanes.reduce(
    (total, lane) =>
      total +
      Object.values(lane).reduce(
        (laneTotal, value) =>
          laneTotal + (ArrayBuffer.isView(value) ? value.byteLength : 0),
        0,
      ),
    0,
  );
  return jsonBytes + projectionBuffers;
}
