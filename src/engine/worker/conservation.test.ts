import { describe, expect, test } from "vitest";
import { evidenceIdentity } from "../../domain/evidence";
import { sessionId } from "../../domain/analysis";
import { makeFullEnvelopeFixture } from "../../test/traceEnvelopeFixtures";
import { ENGINE_LIMITS } from "../limits";
import { assertTraceSessionConservation } from "./conservation";
import { ingestFullEnvelope } from "./fullEnvelope";
import {
  buildCompatibilityProjection,
  buildEventEvidenceSlice,
  buildSessionManifest,
  projectionByteLength,
} from "./projections";
import { TraceSessionRepository } from "./sessionRepository";
import { canonicalizeTraceSession } from "./traceSession";

describe("canonical conservation and narrow responses", () => {
  test("conserves complete counts while exposing only bounded requested data", async () => {
    const envelope = makeFullEnvelopeFixture({ eventCount: 30 });
    const repository = new TraceSessionRepository();
    const id = sessionId("session:v1:conservation");
    const stage = await ingestFullEnvelope(
      new Blob([JSON.stringify(envelope)]),
      id,
      repository,
    );
    const canonical = await canonicalizeTraceSession(stage);

    expect(assertTraceSessionConservation(stage.envelope, canonical)).toEqual({
      importedEvents: envelope.traceEvents.length,
      canonicalEvents: envelope.traceEvents.length,
      importedResources: envelope.resources.length,
      canonicalResources: envelope.resources.length,
      importedSourceMaps: Object.keys(envelope.sourceMaps).length,
      canonicalSourceMaps: Object.keys(envelope.sourceMaps).length,
    });

    const manifest = buildSessionManifest(id, canonical);
    expect(manifest).toMatchObject({
      id,
      state: "ready",
      eventCount: envelope.traceEvents.length,
      resourceCount: envelope.resources.length,
      sourceMapCount: Object.keys(envelope.sourceMaps).length,
    });
    expect(manifest).not.toHaveProperty("evidence");
    expect(manifest).not.toHaveProperty("resources");

    const projection = buildCompatibilityProjection(canonical);
    expect(projection).toEqual(canonical.compatibilityProjection);
    expect(projection).not.toBe(canonical.compatibilityProjection);
    expect(projection.lanes[0].starts.buffer).not.toBe(
      canonical.compatibilityProjection.lanes[0].starts.buffer,
    );
    expect(projectionByteLength(projection)).toBeLessThanOrEqual(
      ENGINE_LIMITS.projectionBytes,
    );

    const requestedEvent = canonical.evidence.events[3];
    const slice = buildEventEvidenceSlice(
      canonical,
      evidenceIdentity("evidence:v1:event-3"),
      requestedEvent.key,
    );
    expect(slice.payload).toEqual({ event: requestedEvent });
    expect(JSON.stringify(slice.payload)).not.toContain(
      canonical.evidence.events[4].key,
    );
    expect(slice.byteLength).toBeLessThanOrEqual(ENGINE_LIMITS.evidenceSliceBytes);
  });
});
