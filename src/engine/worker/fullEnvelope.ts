import type { SessionId } from "../../domain/analysis";
import {
  ENGINE_LIMITS,
  projectedInFlightPeakBytes,
  type IngestionMemoryCalibration,
} from "../limits";
import { sha256Hex } from "./hash";
import {
  TraceSessionRepository,
  type CanonicalSessionData,
  type IngestionIntermediates,
} from "./sessionRepository";

export type IngestionErrorCode =
  | "security-limit"
  | "malformed-payload"
  | "invalid-envelope";

export class IngestionError extends Error {
  readonly name = "IngestionError";

  constructor(
    readonly code: IngestionErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const DEFAULT_INGESTION_MEMORY_CALIBRATION: IngestionMemoryCalibration = {
  version: 1,
  measuredAt: "2026-08-20T04:25:08Z",
  fixture: "public/demo-trace.json and deterministic full-envelope fixture",
  inputBufferMultiplier: 2,
  compressedBufferMultiplier: 1,
  utf8DecodeMultiplier: 1,
  jsStringMultiplier: 2,
  jsonParseRawEventsMultiplier: 4.5,
  traceEngineMultiplier: 7.5,
  canonicalizationOverlapMultiplier: 3,
  fixedBytes: 16 * 1024 ** 2,
};

export interface PreservedTraceEnvelope {
  traceEvents: unknown[];
  metadata: Readonly<Record<string, unknown>>;
  settings: Readonly<Record<string, unknown>>;
  resources: readonly Readonly<Record<string, unknown>>[];
  sourceMaps: Readonly<Record<string, string>>;
  topLevel: Readonly<Record<string, unknown>>;
}

export class StagedFullEnvelope {
  private value: PreservedTraceEnvelope | null;
  private imported: Uint8Array | null;
  private payload: Uint8Array | null;
  private text: string | null;

  constructor(
    readonly sessionId: SessionId,
    readonly importSha256: string,
    readonly payloadSha256: string,
    readonly projectedPeakBytes: number,
    envelope: PreservedTraceEnvelope,
    imported: Uint8Array,
    payload: Uint8Array,
    text: string,
  ) {
    this.value = envelope;
    this.imported = imported;
    this.payload = payload;
    this.text = text;
  }

  get envelope(): PreservedTraceEnvelope {
    if (!this.value) throw new Error("Staged envelope has been released");
    return this.value;
  }

  get released(): boolean {
    return this.value === null;
  }

  get retainedIntermediateBytes(): number {
    return (
      (this.imported?.byteLength ?? 0) +
      (this.payload?.byteLength ?? 0) +
      (this.text === null ? 0 : new Blob([this.text]).size)
    );
  }

  release(): void {
    this.value = null;
    this.imported = null;
    this.payload = null;
    this.text = null;
  }
}

export async function ingestFullEnvelope(
  blob: Blob,
  sessionId: SessionId,
  repository: TraceSessionRepository,
  calibration = DEFAULT_INGESTION_MEMORY_CALIBRATION,
  onProgress?: (completed: number, total: number) => void,
): Promise<StagedFullEnvelope> {
  if (blob.size > ENGINE_LIMITS.importedBytes) {
    throw new IngestionError("security-limit", "Imported byte limit exceeded");
  }
  const compressed = await hasGzipMagic(blob);
  const expectedPayloadBytes = compressed ? await gzipUncompressedSize(blob) : blob.size;
  if (expectedPayloadBytes > ENGINE_LIMITS.streamingDecompressedBytes) {
    throw new IngestionError(
      "security-limit",
      "Streaming decompressed byte limit exceeded",
    );
  }
  const projectedPeakBytes = projectedInFlightPeakBytes(
    {
      importedBytes: blob.size,
      decompressedBytes: expectedPayloadBytes,
      compressed,
    },
    calibration,
  );

  let reserved = false;
  try {
    if (repository.has(sessionId)) {
      const existing = repository.get(sessionId);
      if (
        existing.state !== "reserved" ||
        existing.progress.total !== blob.size ||
        existing.projectedPeakBytes < projectedPeakBytes
      ) {
        throw new Error("Existing session reservation does not cover this import");
      }
    } else {
      repository.reserve(sessionId, { importedBytes: blob.size, projectedPeakBytes });
    }
    reserved = true;
    repository.beginIngest(sessionId);
    const imported = await collectStream(
      blob.stream(),
      ENGINE_LIMITS.importedBytes,
      "Imported byte limit exceeded",
      (completed) => {
        repository.updateIngestProgress(sessionId, completed);
        onProgress?.(completed, blob.size);
      },
    );
    const importSha256 = await sha256Hex(imported);
    const payload = compressed
      ? await decompressGzip(blob, expectedPayloadBytes)
      : imported;
    const payloadSha256 = compressed ? await sha256Hex(payload) : importSha256;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(payload);
    const envelope = parseEnvelope(text);
    const intermediates: IngestionIntermediates = {
      importedBytes: imported,
      decompressedBytes: payload,
      decodedText: text,
      rawEvents: envelope.traceEvents,
      traceEngineData: null,
    };
    repository.beginCanonicalize(sessionId, intermediates);

    return new StagedFullEnvelope(
      sessionId,
      importSha256,
      payloadSha256,
      projectedPeakBytes,
      envelope,
      imported,
      payload,
      text,
    );
  } catch (error) {
    if (reserved) repository.cancel(sessionId);
    throw normalizeIngestionError(error);
  }
}

export function commitStagedEnvelope(
  repository: TraceSessionRepository,
  stage: StagedFullEnvelope,
  canonical: CanonicalSessionData,
): void {
  repository.commit(stage.sessionId, canonical);
  stage.release();
}

async function hasGzipMagic(blob: Blob): Promise<boolean> {
  if (blob.size < 2) return false;
  const bytes = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function gzipUncompressedSize(blob: Blob): Promise<number> {
  if (blob.size < 18) {
    throw new IngestionError("malformed-payload", "Malformed gzip payload");
  }
  const trailer = await blob.slice(blob.size - 4).arrayBuffer();
  const byteLength = new DataView(trailer).getUint32(0, true);
  if (byteLength === 0) {
    throw new IngestionError("malformed-payload", "Empty or oversized gzip payload");
  }
  return byteLength;
}

async function decompressGzip(blob: Blob, expectedBytes: number): Promise<Uint8Array> {
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  const payload = await collectStream(
    stream,
    Math.min(expectedBytes, ENGINE_LIMITS.streamingDecompressedBytes),
    "Streaming decompressed byte limit exceeded",
  );
  if (payload.byteLength !== expectedBytes) {
    throw new IngestionError(
      "malformed-payload",
      "Gzip size trailer does not match decompressed payload",
    );
  }
  return payload;
}

async function collectStream(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  limitMessage: string,
  onProgress?: (completed: number) => void,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel(limitMessage);
        throw new IngestionError("security-limit", limitMessage);
      }
      chunks.push(value);
      onProgress?.(total);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function parseEnvelope(text: string): PreservedTraceEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new IngestionError("malformed-payload", "Malformed JSON payload");
  }
  if (!isRecord(value) || !Array.isArray(value.traceEvents) || value.traceEvents.length === 0) {
    throw new IngestionError("invalid-envelope", "No traceEvents array found in payload");
  }
  if (value.traceEvents.length > ENGINE_LIMITS.events) {
    throw new IngestionError("security-limit", "Trace event limit exceeded");
  }
  const metadata = optionalRecord(value.metadata, "metadata");
  const settings = optionalRecord(value.settings, "settings");
  const resources = optionalRecordArray(value.resources, "resources");
  const sourceMaps = optionalStringRecord(value.sourceMaps, "sourceMaps");
  let retainedSourceBytes = 0;

  for (const resource of resources) {
    const content = resource.content;
    if (typeof content === "string") {
      const byteLength = encodedLength(content);
      if (byteLength > ENGINE_LIMITS.resourceBytes) {
        throw new IngestionError("security-limit", "Resource byte limit exceeded");
      }
      retainedSourceBytes += byteLength;
    }
  }
  for (const sourceMap of Object.values(sourceMaps)) {
    const byteLength = encodedLength(sourceMap);
    if (byteLength > ENGINE_LIMITS.sourceMapBytes) {
      throw new IngestionError("security-limit", "Source map byte limit exceeded");
    }
    retainedSourceBytes += byteLength;
  }
  if (retainedSourceBytes > ENGINE_LIMITS.retainedSourceBytesPerSession) {
    throw new IngestionError(
      "security-limit",
      "Retained source data per-session byte limit exceeded",
    );
  }

  return {
    traceEvents: value.traceEvents,
    metadata,
    settings,
    resources,
    sourceMaps,
    topLevel: value,
  };
}

function optionalRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function optionalRecordArray(
  value: unknown,
  label: string,
): readonly Readonly<Record<string, unknown>>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) {
    throw new Error(`${label} must be an array of objects`);
  }
  return value;
}

function optionalStringRecord(value: unknown, label: string): Readonly<Record<string, string>> {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.values(value).some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be an object of strings`);
  }
  return value as Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodedLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function normalizeIngestionError(error: unknown): IngestionError {
  if (error instanceof IngestionError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const code = /limit|memory/i.test(message) ? "security-limit" : "malformed-payload";
  return new IngestionError(code, message);
}
