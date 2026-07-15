/**
 * Parse worker: JSON decode + trace_engine + columnarization all happen off
 * the main thread; the columnar model transfers back zero-copy.
 */
import { parseTrace } from "./adapter";
import type { ParsedTraceModel } from "./types";

interface ParseFileRequest {
  id: number;
  type: "parse-file";
  file: File;
}

interface ParseUrlRequest {
  id: number;
  type: "parse-url";
  url: string;
}

export type ParseRequest = ParseFileRequest | ParseUrlRequest;

export interface ParseResponse {
  id: number;
  ok: boolean;
  model?: ParsedTraceModel;
  error?: string;
}

function transferables(model: ParsedTraceModel): ArrayBuffer[] {
  return model.lanes.flatMap((lane) => [
    lane.starts.buffer,
    lane.durs.buffer,
    lane.depths.buffer,
    lane.catIds.buffer,
    lane.selfTimes.buffer,
    lane.nameIds.buffer,
  ]) as ArrayBuffer[];
}

/** Gunzip when the payload carries the gzip magic bytes (.json.gz exports). */
async function decodeBody(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([buffer])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }
  return new TextDecoder().decode(buffer);
}

async function handle(request: ParseRequest): Promise<void> {
  try {
    const buffer =
      request.type === "parse-file"
        ? await request.file.arrayBuffer()
        : await (await fetch(request.url)).arrayBuffer();
    const text = await decodeBody(buffer);
    const json = JSON.parse(text) as { traceEvents?: unknown[] };
    const events = json.traceEvents;
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error("No traceEvents array found in file");
    }
    const model = await parseTrace(events);
    const response: ParseResponse = { id: request.id, ok: true, model };
    (self as unknown as Worker).postMessage(response, transferables(model));
  } catch (error) {
    const response: ParseResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    (self as unknown as Worker).postMessage(response);
  }
}

// trace_engine keeps module-level handler state, so concurrent parses would
// corrupt each other's results. Requests run strictly one at a time; handle()
// never rejects, so the chain cannot stall.
let queue: Promise<void> = Promise.resolve();
self.onmessage = (event: MessageEvent<ParseRequest>) => {
  queue = queue.then(() => handle(event.data));
};
