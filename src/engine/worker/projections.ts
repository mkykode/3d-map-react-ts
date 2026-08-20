import type { EvidenceIdentity, EvidenceSlice } from "../../domain/evidence";
import type { SessionId } from "../../domain/analysis";
import { ENGINE_LIMITS } from "../limits";
import type { SessionManifest } from "../protocol";
import type { ParsedTraceModel } from "../types";
import type { CanonicalTraceSession } from "./traceSession";
import { encodedJsonBytes } from "./serialization";

export function buildSessionManifest(
  id: SessionId,
  canonical: CanonicalTraceSession,
): SessionManifest {
  return {
    version: 1,
    id,
    state: "ready",
    importSha256: canonical.importSha256,
    payloadSha256: canonical.payloadSha256,
    retainedBytes: canonical.retainedBytes,
    eventCount: canonical.evidence.eventCount,
    resourceCount: canonical.resources.length,
    sourceMapCount: canonical.sourceMaps.length,
    metadata: canonical.metadata,
    settings: canonical.settings,
  };
}

export function buildCompatibilityProjection(
  canonical: CanonicalTraceSession,
): ParsedTraceModel {
  const projection = structuredClone(canonical.compatibilityProjection);
  const byteLength = projectionByteLength(projection);
  if (byteLength > ENGINE_LIMITS.projectionBytes) {
    throw new Error(
      `Projection byte limit exceeded: ${byteLength} > ${ENGINE_LIMITS.projectionBytes}`,
    );
  }
  return projection;
}

export function buildEventEvidenceSlice(
  canonical: CanonicalTraceSession,
  id: EvidenceIdentity,
  eventKey: string,
): EvidenceSlice {
  const event = canonical.evidence.events.find((candidate) => candidate.key === eventKey);
  if (!event) throw new Error(`Evidence event not found: ${eventKey}`);
  const payload = { event };
  const byteLength = encodedJsonBytes(payload);
  if (byteLength > ENGINE_LIMITS.evidenceSliceBytes) {
    throw new Error(
      `Evidence slice byte limit exceeded: ${byteLength} > ${ENGINE_LIMITS.evidenceSliceBytes}`,
    );
  }
  return {
    version: 1,
    id,
    level: "trace-observation",
    availability: { state: "available" },
    unit: "ms",
    byteLength,
    payload,
  };
}

export function projectionByteLength(model: ParsedTraceModel): number {
  const { lanes, ...metadata } = model;
  const columnBytes = lanes.reduce(
    (total, lane) =>
      total +
      Object.values(lane).reduce(
        (laneTotal, value) =>
          laneTotal + (ArrayBuffer.isView(value) ? value.byteLength : 0),
        0,
      ),
    0,
  );
  return columnBytes + encodedJsonBytes({ metadata, lanes: lanes.map((lane) => lane.meta) });
}
