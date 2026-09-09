import { Tokenizer, TokenParser, TokenType } from "@streamparser/json";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { STREAM_LIMITS } from "./budget.ts";
import type { StreamOptions, TraceEvent } from "./types.ts";

export interface TraceStreamConsumer {
  event: (event: TraceEvent, rawBytes: number) => void;
  field: (key: string, value: unknown) => void;
  /** A backpressure checkpoint after each bounded input chunk. */
  flush?: () => Promise<void>;
}

export interface TraceStreamResult {
  importSha256: string;
  payloadSha256: string;
  decompressedBytes: number;
  /** Array members that were not well-formed trace events; skipped, counted. */
  malformedEvents: number;
}

export async function isGzip(blob: Blob): Promise<boolean> {
  const magic = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  return magic[0] === 0x1f && magic[1] === 0x8b;
}

/** No whole-file string, byte buffer, or parser-owned event array. */
export async function readTraceStream(
  blob: Blob,
  consumer: TraceStreamConsumer,
  options: StreamOptions = {},
): Promise<TraceStreamResult> {
  if (blob.size > STREAM_LIMITS.inputBytes) throw new Error("Trace exceeds the 8 GiB streaming input limit.");
  const check = () => { options.signal?.throwIfAborted(); options.checkCanceled?.(); };
  check();
  const compressed = await isGzip(blob);
  const importedHash = sha256.create();
  const payloadHash = sha256.create();
  let importedBytes = 0;
  let decompressedBytes = 0;
  let lastYield = performance.now();
  const source = blob.stream().pipeThrough(new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
    transform(chunk, controller) {
      check();
      importedBytes += chunk.byteLength;
      if (options.hashes !== false) importedHash.update(chunk);
      controller.enqueue(chunk);
    },
  }));
  const stream = compressed ? source.pipeThrough(new DecompressionStream("gzip")) : source;
  const reader = stream.getReader();
  const tokenizer = new Tokenizer({ stringBufferSize: 64 * 1024 });
  let parser: TokenParser | undefined;
  let depth = 0;
  let rootArray = false;
  let rootKey = "";
  let hasEvents = false;
  let eventCount = 0;
  let malformedEvents = 0;
  let lastTokenOffset = 0;
  let valueStart = 0;
  let inValue = false;
  let valueDepth = 0;
  const fields = new Set<string>();

  tokenizer.onToken = (token) => {
    lastTokenOffset = token.offset;
    if (!parser) {
      rootArray = token.token === TokenType.LEFT_BRACKET;
      if (!rootArray && token.token !== TokenType.LEFT_BRACE) throw new Error("Expected a traceEvents object or an event array.");
      hasEvents = rootArray;
      parser = new TokenParser({
        paths: rootArray ? ["$.*"] : ["$.traceEvents.*", "$.metadata", "$.settings"],
        keepStack: false,
      });
      parser.onValue = ({ value, key, stack }) => {
        if ((rootArray && stack.length === 1) || (!rootArray && stack.length === 2 && stack[1].key === "traceEvents")) {
          eventCount++;
          if (eventCount > STREAM_LIMITS.events) throw new Error("Streaming event limit exceeded.");
          // One odd member must not abort a gigabyte import; the exact path
          // tolerated these too. Skipped members are counted and reported.
          if (!isTraceEvent(value)) { malformedEvents++; return; }
          consumer.event(value, lastTokenOffset - valueStart + 1);
        } else if (stack.length === 1 && typeof key === "string") {
          consumer.field(key, value);
        }
      };
    }
    const opening = token.token === TokenType.LEFT_BRACE || token.token === TokenType.LEFT_BRACKET;
    const closing = token.token === TokenType.RIGHT_BRACE || token.token === TokenType.RIGHT_BRACKET;
    // At root-object depth, a string after { or , is a key, tracked below.
    if (!rootArray && depth === 1 && token.token === TokenType.STRING && expectRootKey) {
      rootKey = String(token.value);
      if (fields.has(rootKey)) throw new Error(`Duplicate trace field: ${rootKey}`);
      fields.add(rootKey);
      if (fields.size > 128) throw new Error("Trace envelope field limit exceeded.");
      expectRootKey = false;
      if (rootKey !== "traceEvents" && rootKey !== "metadata" && rootKey !== "settings") consumer.field(rootKey, undefined);
    }
    if (!rootArray && depth === 1 && token.token === TokenType.COLON) expectRootValue = true;
    else if (expectRootValue) {
      expectRootValue = false;
      if (rootKey === "traceEvents") {
        if (token.token !== TokenType.LEFT_BRACKET) throw new Error("traceEvents must be an array.");
        hasEvents = true;
      }
    }
    const eventDepth = rootArray ? 1 : 2;
    if (!inValue && opening && ((depth === eventDepth && (rootArray || rootKey === "traceEvents")) || (!rootArray && depth === 1 && (rootKey === "metadata" || rootKey === "settings")))) {
      valueStart = token.offset;
      inValue = true;
      valueDepth = depth;
    }
    if (inValue && token.offset - valueStart > STREAM_LIMITS.valueBytes) throw new Error("Individual trace event exceeds the 16 MiB limit.");
    if (opening) depth++;
    if (depth > STREAM_LIMITS.nesting) throw new Error("Trace JSON nesting limit exceeded.");
    parser.write(token);
    if (closing) {
      depth--;
      if (depth === valueDepth) inValue = false;
    }
    if (!rootArray && depth === 1 && token.token === TokenType.COMMA) expectRootKey = true;
  };
  let expectRootKey = true;
  let expectRootValue = false;
  tokenizer.onEnd = () => { if (parser && !parser.isEnded) parser.end(); };
  try {
    while (true) {
      check();
      const { value, done } = await reader.read();
      if (done) break;
      for (let offset = 0; offset < value.length; offset += 64 * 1024) {
        check();
        const chunk = value.subarray(offset, offset + 64 * 1024);
        decompressedBytes += chunk.byteLength;
        if (decompressedBytes > STREAM_LIMITS.decompressedBytes) throw new Error("Streaming decompressed byte limit exceeded (16 GiB).");
        if (compressed && options.hashes !== false) payloadHash.update(chunk);
        // The tokenizer consumes bytes directly: it completes multi-byte
        // characters split across chunks itself and rejects invalid UTF-8, so
        // decoding to a string here would only add a second transcoding pass.
        tokenizer.write(chunk);
        if (decompressedBytes - lastTokenOffset > STREAM_LIMITS.valueBytes || (inValue && decompressedBytes - valueStart > STREAM_LIMITS.valueBytes)) {
          throw new Error("Individual trace JSON value exceeds the 16 MiB limit.");
        }
        await consumer.flush?.();
        if (performance.now() - lastYield > 50) {
          options.onProgress?.(importedBytes, blob.size);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          lastYield = performance.now();
        }
      }
    }
    if (!tokenizer.isEnded) tokenizer.end();
    if (!hasEvents || eventCount - malformedEvents === 0) throw new Error("Trace contains no events.");
    check();
    options.onProgress?.(blob.size, blob.size);
    const importSha256 = options.hashes === false ? "" : bytesToHex(importedHash.digest());
    return { importSha256, payloadSha256: compressed && options.hashes !== false ? bytesToHex(payloadHash.digest()) : importSha256, decompressedBytes, malformedEvents };
  } finally {
    // cancel() rejects on an already-errored stream (abort in the transform,
    // corrupt gzip); the original error is what propagates, not this one.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    importedHash.destroy();
    payloadHash.destroy();
  }
}

function isTraceEvent(value: unknown): value is TraceEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return typeof event.name === "string" && typeof event.ph === "string" &&
    typeof event.ts === "number" && Number.isFinite(event.ts) &&
    typeof event.pid === "number" && Number.isFinite(event.pid) &&
    typeof event.tid === "number" && Number.isFinite(event.tid) &&
    (event.cat === undefined || typeof event.cat === "string") &&
    (event.dur === undefined || (typeof event.dur === "number" && Number.isFinite(event.ts + event.dur) && event.dur >= 0));
}
