import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { prepareTrace, scanTrace } from "./prepare";
import { readTraceStream } from "./jsonStream";
import { TraceFilter } from "./filter";
import type { TraceEvent } from "./types";
import { readTraceReduction } from "./reduction";

const event = (ts = 1000, extra = {}): TraceEvent => ({ name: "RunTask", ph: "X", ts, dur: 200, pid: 1, tid: 1, cat: "devtools.timeline", ...extra });
const blob = (events: TraceEvent[]) => new Blob([JSON.stringify({ traceEvents: events })]);

class TinyChunks extends Blob {
  override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    const source = super.stream();
    return source.pipeThrough(new TransformStream({ transform(chunk, controller) {
      for (const byte of chunk) controller.enqueue(new Uint8Array([byte]));
    } }));
  }
}

describe("streaming trace ingestion", () => {
  it("reads split Unicode, escapes, numbers, metadata after events, and exact hashes", async () => {
    const text = JSON.stringify({ traceEvents: [event(1000, { name: 'é🗺️\\"line\n', args: { nested: [1, null, true] } })], metadata: { device: "Mac" }, settings: { enabled: true } });
    const prepared = await prepareTrace(new TinyChunks([text]));
    expect(prepared.traceEvents[0].name).toBe('é🗺️\\"line\n');
    expect(prepared.metadata.device).toBe("Mac");
    expect(prepared.settings.enabled).toBe(true);
    expect(prepared.report.payloadSha256).toBe(createHash("sha256").update(text).digest("hex"));
  });

  it("accepts root arrays and gzip by magic, not filename", async () => {
    const text = JSON.stringify([event()]);
    const gzip = gzipSync(text);
    const prepared = await prepareTrace(new Blob([gzip]));
    expect(prepared.traceEvents).toEqual([event()]);
    expect(prepared.report.importSha256).toBe(createHash("sha256").update(gzip).digest("hex"));
    expect(prepared.report.payloadSha256).toBe(createHash("sha256").update(text).digest("hex"));
  });

  it("filters only named bookkeeping and source categories, keeps memory peaks and profiles", async () => {
    const prepared = await prepareTrace(blob([
      event(1000, { name: "v8.callFunction" }), event(1001, { name: "v8::Debugger::foo" }),
      event(1002, { cat: "disabled-by-default-v8.inspector" }),
      event(1003, { cat: "disabled-by-default-devtools.v8-source-rundown-sources" }),
      event(1010, { name: "UpdateCounters" }), event(1011, { name: "UpdateCounters" }),
      event(1020, { name: "Profile" }), event(1021, { cat: "devtools.timeline,disabled-by-default-v8.inspector" }),
    ]));
    expect(prepared.traceEvents).toHaveLength(4);
    expect(prepared.report.droppedBookkeeping).toBe(3);
    expect(prepared.report.droppedSourceEvents).toBe(1);
  });

  it.each(['{"traceEvents":[]}', '{"traceEvents":{}}', '[null]', '{"traceEvents":[', '{"traceEvents":[],"traceEvents":[]}'])('rejects malformed/envelope input: %s', async (text) => {
    await expect(prepareTrace(new Blob([text]))).rejects.toThrow();
  });

  it("rejects invalid UTF-8 and corrupt gzip", async () => {
    await expect(prepareTrace(new Blob([new Uint8Array([255])]))).rejects.toThrow();
    await expect(prepareTrace(new Blob([gzipSync(JSON.stringify([event()])).subarray(0, 20)]))).rejects.toThrow();
  });

  it("bounds retained memory, nesting, and checks cancellation during reading", async () => {
    await expect(prepareTrace(blob([event()]), null, { maxPeakBytes: 1 })).rejects.toThrow(/shorter time window/);
    await expect(prepareTrace(new Blob(['{"traceEvents":[' + '['.repeat(140) + '0' + ']'.repeat(140) + ']}']))).rejects.toThrow(/nesting/);
    const abort = new AbortController();
    await expect(readTraceStream(new TinyChunks([JSON.stringify([event(), event(2000)])]), { event: () => abort.abort(), field: () => {} }, { signal: abort.signal })).rejects.toThrow();
  });

  it("keeps the activity histogram bounded for long and out-of-order traces", async () => {
    const overview = await scanTrace(blob([event(10 ** 12), event(1), event(5 * 10 ** 11)]));
    expect(overview.counts.length).toBeLessThanOrEqual(2048);
    expect(overview.counts.reduce((sum, count) => sum + count, 0)).toBe(3);
    expect(overview.startUs).toBe(1);
  });

  it("clips synchronous spans and keeps cross-thread profile clocks and node definitions", () => {
    const retained: TraceEvent[] = [];
    const filter = new TraceFilter((e) => retained.push(e), [1100, 1400]);
    filter.accept(event(1000, { name: "Profile", ph: "P", id: "p", args: { data: { startTime: 999999 } } }));
    filter.accept(event(2000, { name: "ProfileChunk", ph: "P", tid: 99, id: "p", args: { data: { cpuProfile: { nodes: [{ id: 1 }], samples: [1, 1, 1, 1] }, timeDeltas: [50, 100, 100, 200], lines: [1, 2, 3, 4] } } }));
    filter.accept(event(1000, { ph: "B", dur: undefined }));
    filter.accept(event(1500, { ph: "E", dur: undefined }));
    expect(retained[0].ts).toBe(1100);
    expect(retained[1].args?.data).toMatchObject({ cpuProfile: { nodes: [{ id: 1 }], samples: [1, 1] }, timeDeltas: [50, 100], lines: [2, 3] });
    expect(retained[2]).toMatchObject({ ph: "X", ts: 1100, dur: 300 });
  });

  it("preserves negative sample deltas and passes trace-id to node-id maps through after windowing", () => {
    const retained: TraceEvent[] = [];
    const filter = new TraceFilter((e) => retained.push(e), [1100, 1400]);
    filter.accept(event(1000, { name: "Profile", ph: "P", id: "p" }));
    // trace_ids is keyed by trace id, not sample index (SamplesIntegrator
    // reads traceIds[traceId] to find a node); nodes are all kept, so the
    // map must survive intact even when most samples fall outside the window.
    const traceIds = { 4001: 1, 4002: 1, 90210: 1 };
    filter.accept(event(2000, { name: "ProfileChunk", ph: "P", id: "p", args: { data: {
      cpuProfile: { nodes: [{ id: 1, hitCount: 100 }], samples: [1, 1, 1, 1], trace_ids: traceIds },
      timeDeltas: [50, 200, -50, 500], lines: [1, 2, 3, 4], columns: [10, 20, 30, 40],
    } } }));
    expect(retained[1].args?.data).toMatchObject({
      cpuProfile: { samples: [1, 1], trace_ids: traceIds },
      timeDeltas: [150, -50], lines: [2, 3], columns: [20, 30],
    });
    const data = retained[1].args?.data as { cpuProfile: { nodes: Record<string, unknown>[] } };
    expect(data.cpuProfile.nodes[0]).not.toHaveProperty("hitCount");
  });

  it("skips malformed array members, counts them, and anchors the overview on tracing start", async () => {
    const stray = event(1_000, { name: "PipelineReporter", ph: "b", dur: undefined });
    const events = [
      stray,
      { name: "TracingStartedInBrowser", ph: "I", ts: 9_000_000, pid: 1, tid: 1, cat: "disabled-by-default-devtools.timeline" } as TraceEvent,
      event(9_100_000),
      { name: "NoTimestamp", ph: "X", pid: 1, tid: 1 } as unknown as TraceEvent,
      { name: "NegativeDuration", ph: "X", ts: 9_200_000, dur: -5, pid: 1, tid: 1 } as TraceEvent,
      event(9_300_000),
    ];
    const prepared = await prepareTrace(blob(events));
    expect(prepared.report.droppedMalformed).toBe(2);
    expect(prepared.traceEvents.map((e) => e.name)).toEqual(["PipelineReporter", "TracingStartedInBrowser", "RunTask", "RunTask"]);
    const overview = await scanTrace(blob(events));
    expect(overview.startUs).toBe(9_000_000);
    expect(overview.counts.reduce((sum, count) => sum + count, 0)).toBe(3);
    expect(readTraceReduction(prepared.report)).toEqual(prepared.report);
  });

  it("rejects oversized individual values and does not pollute object prototypes", async () => {
    await expect(prepareTrace(blob([event(1000, { args: { value: "x".repeat(16 * 1024 ** 2 + 1) } })]))).rejects.toThrow(/16 MiB/);
    const text = '{"traceEvents":[{"name":"RunTask","ph":"X","ts":1000,"pid":1,"tid":1,"__proto__":{"polluted":true}}]}';
    const prepared = await prepareTrace(new Blob([text]));
    expect(Object.getPrototypeOf(prepared.traceEvents[0])).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(prepared.traceEvents[0], "__proto__")).toBe(true);
    expect({}).not.toHaveProperty("polluted");
  });

  it("does not trust malformed reduction metadata from an input file", async () => {
    expect(readTraceReduction({ mode: "visualization", window: "bad" })).toBeNull();
    const prepared = await prepareTrace(blob([event()]));
    expect(readTraceReduction(prepared.report)).toEqual(prepared.report);
    expect(readTraceReduction({ ...prepared.report, retainedEventCount: -1 })).toBeNull();
  });
});
