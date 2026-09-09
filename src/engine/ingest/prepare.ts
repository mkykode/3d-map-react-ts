import { STREAM_LIMITS, streamingPeakBytes, WINDOW_REQUIRED } from "./budget.ts";
import { bookkeepingEvent, record, sourceEvent, TraceFilter } from "./filter.ts";
import { readTraceStream } from "./jsonStream.ts";
import type { PreparedTrace, StreamOptions, TraceEvent, TraceOverview, TraceWindow } from "./types.ts";

const encoder = new TextEncoder();
export function jsonBytes(value: unknown): number { return encoder.encode(JSON.stringify(value)).byteLength; }

export async function scanTrace(blob: Blob, options: StreamOptions = {}): Promise<TraceOverview> {
  let startUs = Infinity;
  let endUs = -Infinity;
  let bucketWidthUs = 100_000;
  let buckets = new Map<number, number>();
  let eventCount = 0;
  let retainedEventCount = 0;
  let retainedBytes = 0;
  const result = await readTraceStream(blob, {
    event(event, rawBytes) {
      eventCount++;
      if (bookkeepingEvent(event) || sourceEvent(event)) return;
      retainedEventCount++;
      retainedBytes += rawBytes;
      if (event.ph === "M") return;
      startUs = Math.min(startUs, event.ts);
      endUs = Math.max(endUs, event.ts + (event.dur ?? 0));
      while (Math.floor(endUs / bucketWidthUs) - Math.floor(startUs / bucketWidthUs) >= STREAM_LIMITS.histogramBins) {
        bucketWidthUs *= 2;
        const next = new Map<number, number>();
        for (const [key, count] of buckets) {
          const merged = Math.floor(key / 2);
          next.set(merged, (next.get(merged) ?? 0) + count);
        }
        buckets = next;
      }
      const bucket = Math.floor(event.ts / bucketWidthUs);
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    },
    field(key, value) { if (key === "metadata" || key === "settings") retainedBytes += jsonBytes(value); },
  }, { ...options, hashes: false });
  if (!Number.isFinite(startUs)) throw new Error("Trace has no timed events.");
  endUs = Math.max(startUs + 1, endUs);
  const firstBucket = Math.floor(startUs / bucketWidthUs);
  const counts = Array.from({ length: Math.floor(endUs / bucketWidthUs) - firstBucket + 1 }, (_, i) => buckets.get(firstBucket + i) ?? 0);
  return { startUs, endUs, bucketStartUs: firstBucket * bucketWidthUs, bucketWidthUs, counts, eventCount, retainedEventCount, retainedBytes, decompressedBytes: result.decompressedBytes };
}

export async function prepareTrace(
  blob: Blob,
  window: TraceWindow | null = null,
  options: StreamOptions & { maxPeakBytes?: number } = {},
): Promise<PreparedTrace> {
  const traceEvents: TraceEvent[] = [];
  let retainedBytes = 0;
  const checkBudget = () => {
    if (retainedBytes > STREAM_LIMITS.retainedBytes || traceEvents.length > STREAM_LIMITS.retainedEvents ||
      streamingPeakBytes(retainedBytes, traceEvents.length) > (options.maxPeakBytes ?? Infinity)) throw new Error(WINDOW_REQUIRED);
  };
  const filter = new TraceFilter((event) => {
    if (traceEvents.length >= STREAM_LIMITS.retainedEvents) throw new Error(WINDOW_REQUIRED);
    retainedBytes += jsonBytes(event);
    checkBudget();
    traceEvents.push(event);
  }, window);
  let metadata: Record<string, unknown> = {};
  let settings: Record<string, unknown> = {};
  const result = await readTraceStream(blob, {
    event: (event) => filter.accept(event),
    field(key, value) {
      if (key === "metadata" || key === "settings") {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} must be an object.`);
        retainedBytes += jsonBytes(value);
        checkBudget();
        if (key === "metadata") metadata = record(value);
        else settings = record(value);
      } else {
        if (filter.report.omittedEnvelopeFields.length >= 128) throw new Error("Trace envelope field limit exceeded.");
        filter.report.omittedEnvelopeFields.push(key);
      }
    },
  }, options);
  if (traceEvents.length === 0) throw new Error("No events remain in this time window. Choose another interval.");
  const report = { ...filter.report, importSha256: result.importSha256, payloadSha256: result.payloadSha256 };
  if (metadata.traceTopographyReduction !== undefined && metadata.traceTopographySourceReduction === undefined) {
    metadata.traceTopographySourceReduction = metadata.traceTopographyReduction;
  }
  return { traceEvents, metadata: { ...metadata, traceTopographyReduction: report }, settings, report, retainedBytes };
}
