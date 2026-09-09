import type { SessionId } from "../../domain/analysis";
import { ENGINE_LIMITS } from "../limits";
import { STREAM_LIMITS, streamingPeakBytes } from "../ingest/budget";
import { prepareTrace } from "../ingest/prepare";
import type { StreamOptions, TraceWindow } from "../ingest/types";
import { StagedFullEnvelope } from "./fullEnvelope";
import type { TraceSessionRepository } from "./sessionRepository";

export async function ingestStreamingEnvelope(
  blob: Blob,
  id: SessionId,
  repository: TraceSessionRepository,
  window: TraceWindow | null,
  options: StreamOptions,
): Promise<StagedFullEnvelope> {
  const budget = Math.min(
    streamingPeakBytes(STREAM_LIMITS.retainedBytes, STREAM_LIMITS.retainedEvents),
    ENGINE_LIMITS.aggregateRetainedAndInFlightBytes - repository.accounting.totalBytes,
  );
  if (budget <= STREAM_LIMITS.streamOverheadBytes) throw new Error("Not enough import memory. Dispose the experiment or comparison before loading another trace.");
  repository.reserve(id, { importedBytes: blob.size, projectedPeakBytes: budget, streaming: true });
  repository.beginIngest(id);
  try {
    const prepared = await prepareTrace(blob, window, { ...options, maxPeakBytes: budget });
    repository.updateIngestProgress(id, blob.size);
    repository.beginCanonicalize(id, {
      importedBytes: null, decompressedBytes: null, decodedText: null,
      rawEvents: prepared.traceEvents, traceEngineData: null,
    });
    return new StagedFullEnvelope(id, prepared.report.importSha256, prepared.report.payloadSha256, budget, {
      traceEvents: prepared.traceEvents, metadata: prepared.metadata, settings: prepared.settings,
      resources: [], sourceMaps: {}, topLevel: {}, visualizationWindow: window ?? undefined,
    }, null, null, null);
  } catch (error) {
    repository.cancel(id);
    throw error;
  }
}
