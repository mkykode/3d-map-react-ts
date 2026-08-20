import { describe, expect, test } from "vitest";
import { sessionId } from "../../domain/analysis";
import { ENGINE_LIMITS } from "../limits";
import {
  encodeEnvelopeFixture,
  makeFullEnvelopeFixture,
} from "../../test/traceEnvelopeFixtures";
import {
  DEFAULT_INGESTION_MEMORY_CALIBRATION,
  commitStagedEnvelope,
  ingestFullEnvelope,
} from "./fullEnvelope";
import { TraceSessionRepository } from "./sessionRepository";
import { discardStagedTraceSession } from "./traceSession";

describe("full-envelope ingestion", () => {
  test("preserves the full envelope and deterministically hashes exact uncompressed bytes", async () => {
    const bytes = encodeEnvelopeFixture(
      makeFullEnvelopeFixture({ runId: "baseline-1", sourceMapKind: "index" }),
    );
    const firstRepository = new TraceSessionRepository();
    const secondRepository = new TraceSessionRepository();
    const first = await ingestFullEnvelope(
      new Blob([bytes.buffer as ArrayBuffer]),
      sessionId("session:v1:baseline-1"),
      firstRepository,
    );
    const second = await ingestFullEnvelope(
      new Blob([bytes.buffer as ArrayBuffer]),
      sessionId("session:v1:baseline-2"),
      secondRepository,
    );

    expect(first.importSha256).toBe(first.payloadSha256);
    expect(second.importSha256).toBe(first.importSha256);
    expect(first.envelope).toMatchObject({
      metadata: { scenario: "checkout", runId: "baseline-1" },
      settings: { captureScreenshots: true, includeResources: true },
      resources: { length: 2 },
      sourceMaps: expect.any(Object),
    });

    expect(first.retainedIntermediateBytes).toBeGreaterThan(0);
    commitStagedEnvelope(firstRepository, first, canonicalData(first));
    expect(first.released).toBe(true);
    expect(first.retainedIntermediateBytes).toBe(0);
    expect(firstRepository.get(sessionId("session:v1:baseline-1"))).toMatchObject({
      state: "ready",
      hasIntermediates: false,
    });
  });

  test("fails closed with a specific malformed-payload reason and no stale result", async () => {
    const repository = new TraceSessionRepository();
    const id = sessionId("session:v1:malformed");

    await expect(
      ingestFullEnvelope(new Blob(['{"traceEvents":[']), id, repository),
    ).rejects.toMatchObject({
      name: "IngestionError",
      code: "malformed-payload",
      message: "Malformed JSON payload",
    });
    expect(repository.get(id)).toMatchObject({
      state: "canceled",
      availability: { state: "unavailable", reason: "canceled" },
      retainedBytes: 0,
      hasIntermediates: false,
    });
  });

  test("releases staged bytes and repository intermediates after downstream failure", async () => {
    const repository = new TraceSessionRepository();
    const id = sessionId("session:v1:canonicalization-failure");
    const bytes = encodeEnvelopeFixture(makeFullEnvelopeFixture());
    const stage = await ingestFullEnvelope(
      new Blob([bytes.buffer as ArrayBuffer]),
      id,
      repository,
    );

    discardStagedTraceSession(repository, id, stage);

    expect(stage.released).toBe(true);
    expect(stage.retainedIntermediateBytes).toBe(0);
    expect(repository.get(id)).toMatchObject({
      state: "canceled",
      hasIntermediates: false,
      projectedPeakBytes: 0,
    });
  });

  test("hashes gzip imports separately from their exact JSON payload", async () => {
    const envelope = makeFullEnvelopeFixture({ runId: "compressed-1" });
    const compressed = await gzip(JSON.stringify(envelope));
    const repository = new TraceSessionRepository();
    const stage = await ingestFullEnvelope(
      compressed,
      sessionId("session:v1:compressed-1"),
      repository,
    );

    expect(stage.importSha256).not.toBe(stage.payloadSha256);
    expect(stage.envelope.metadata).toMatchObject({ runId: "compressed-1" });
  });

  test("rejects decompression and aggregate headroom violations before materialization", async () => {
    const compressed = await gzip(JSON.stringify(makeFullEnvelopeFixture()));
    const forged = new Uint8Array(await compressed.arrayBuffer());
    new DataView(forged.buffer).setUint32(
      forged.byteLength - 4,
      ENGINE_LIMITS.streamingDecompressedBytes + 1,
      true,
    );
    await expect(
      ingestFullEnvelope(
        new Blob([forged.buffer]),
        sessionId("session:v1:compression-bomb"),
        new TraceSessionRepository(),
      ),
    ).rejects.toMatchObject({
      code: "security-limit",
      message: "Streaming decompressed byte limit exceeded",
    });

    const tracked = new TrackingBlob([JSON.stringify(makeFullEnvelopeFixture())]);
    await expect(
      ingestFullEnvelope(
        tracked,
        sessionId("session:v1:no-headroom"),
        new TraceSessionRepository(),
        {
          ...DEFAULT_INGESTION_MEMORY_CALIBRATION,
          fixedBytes: ENGINE_LIMITS.aggregateRetainedAndInFlightBytes,
        },
      ),
    ).rejects.toMatchObject({ code: "security-limit" });
    expect(tracked.streamOpened).toBe(false);
  });

  test("reports exact byte progress and bounds observed compressed and uncompressed intermediates", async () => {
    const bytes = encodeEnvelopeFixture(makeFullEnvelopeFixture({ eventCount: 30 }));
    const progress: number[] = [];
    const uncompressed = await ingestFullEnvelope(
      new Blob([bytes.buffer as ArrayBuffer]),
      sessionId("session:v1:observed-uncompressed"),
      new TraceSessionRepository(),
      DEFAULT_INGESTION_MEMORY_CALIBRATION,
      (completed, total) => {
        expect(total).toBe(bytes.byteLength);
        progress.push(completed);
      },
    );
    expect(progress[progress.length - 1]).toBe(bytes.byteLength);
    expect(progress).toEqual([...progress].sort((left, right) => left - right));
    expect(uncompressed.projectedPeakBytes).toBeGreaterThanOrEqual(
      uncompressed.retainedIntermediateBytes,
    );

    const compressedBlob = await gzip(new TextDecoder().decode(bytes));
    const compressed = await ingestFullEnvelope(
      compressedBlob,
      sessionId("session:v1:observed-compressed"),
      new TraceSessionRepository(),
    );
    expect(compressed.projectedPeakBytes).toBeGreaterThanOrEqual(
      compressed.retainedIntermediateBytes,
    );
  });
});

class TrackingBlob extends Blob {
  streamOpened = false;

  override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    this.streamOpened = true;
    return super.stream();
  }
}

async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(stream).arrayBuffer()]);
}

function canonicalData(stage: { importSha256: string; payloadSha256: string }) {
  return {
    importSha256: stage.importSha256,
    payloadSha256: stage.payloadSha256,
    metadata: {},
    settings: {},
    evidence: {},
    screenshots: [],
    resources: [],
    sourceMaps: [],
    scanIndexes: {},
    retainedBytes: 1_024,
  };
}
