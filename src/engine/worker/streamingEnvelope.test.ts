import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sessionId } from "../../domain/analysis";
import { parseTraceForSession } from "../adapter";
import { prepareTrace } from "../ingest/prepare";
import { TraceSessionRepository } from "./sessionRepository";
import { ingestStreamingEnvelope } from "./streamingEnvelope";
import { canonicalizeTraceSession, commitTraceSession } from "./traceSession";
import { assertTraceSessionConservation } from "./conservation";
import { makeFullEnvelopeFixture } from "../../test/traceEnvelopeFixtures";

describe("streamed visualization sessions", () => {
  it("keeps the demo's lane timing, CPU profiles, counters and screenshots", async () => {
    const bytes = readFileSync(new URL("../../../public/demo-trace.json", import.meta.url));
    const original = await parseTraceForSession(JSON.parse(bytes.toString()).traceEvents);
    const prepared = await prepareTrace(new Blob([bytes]));
    const streamed = await parseTraceForSession(prepared.traceEvents);
    const timing = (result: typeof original) => result.projection.lanes.map((lane) => ({
      name: lane.meta.name, starts: [...lane.starts], durs: [...lane.durs], depths: [...lane.depths], selfTimes: [...lane.selfTimes],
    }));
    expect(timing(streamed)).toEqual(timing(original));
    expect(streamed.projection.memory).toEqual(original.projection.memory);
    expect(streamed.projection.screenshots).toEqual(original.projection.screenshots);
    expect(streamed.projection.callFrames.length).toBe(original.projection.callFrames.length);
  }, 15_000);

  it("shifts nesting below omitted v8.callFunction wrappers exactly as the notice states", async () => {
    // The fixture's tasks end before 300 ms; the nested trio sits after them
    // so nothing else shapes its depths. Real FunctionCall events always carry
    // args.data, which the engine's ScriptsHandler reads unconditionally.
    const fixture = makeFullEnvelopeFixture({ eventCount: 100 });
    const base = { cat: "devtools.timeline", ph: "X" as const, pid: 100, tid: 101, args: { data: {} } };
    fixture.traceEvents.push(
      { ...base, name: "RunTask", ts: 300_000, dur: 1_000 },
      { ...base, name: "v8.callFunction", cat: "v8", ts: 300_100, dur: 500, args: {} },
      { ...base, name: "FunctionCall", ts: 300_200, dur: 200 },
    );
    const exact = await parseTraceForSession(fixture.traceEvents);
    const prepared = await prepareTrace(new Blob([JSON.stringify(fixture)]));
    expect(prepared.report.droppedBookkeeping).toBe(1);
    const reduced = await parseTraceForSession(prepared.traceEvents);
    const entry = (result: typeof exact, name: string) => {
      for (const lane of result.projection.lanes) {
        for (let i = 0; i < lane.starts.length; i++) {
          if (result.projection.names[lane.nameIds[i]] === name) return { depth: lane.depths[i], selfMs: lane.selfTimes[i] };
        }
      }
      throw new Error(`${name} missing`);
    };
    // Exact: RunTask > v8.callFunction > FunctionCall. The wrapper is a stack
    // level, so the call sits at depth 2 and RunTask's self time excludes the
    // wrapper's 0.5 ms.
    expect(entry(exact, "FunctionCall").depth).toBe(2);
    expect(entry(exact, "RunTask").selfMs).toBeCloseTo(0.5, 6);
    // Reduced: the wrapper is gone, the call moves up one level, and RunTask
    // absorbs the wrapper's self time (only the 0.2 ms call is subtracted).
    expect(entry(reduced, "FunctionCall").depth).toBe(1);
    expect(entry(reduced, "RunTask").selfMs).toBeCloseTo(0.8, 6);
    expect(entry(reduced, "FunctionCall").selfMs).toBeCloseTo(entry(exact, "FunctionCall").selfMs, 6);
  });

  it("commits only retained evidence, records reductions, and releases intermediates", async () => {
    const repository = new TraceSessionRepository();
    const id = sessionId("session:v1:streamed");
    const fixture = makeFullEnvelopeFixture({ eventCount: 100, taskSpacingUs: 100_000 });
    const stage = await ingestStreamingEnvelope(new Blob([JSON.stringify(fixture)]), id, repository, [1_000_000, 3_000_000], {});
    expect(stage.retainedIntermediateBytes).toBe(0);
    const canonical = await canonicalizeTraceSession(stage);
    expect(canonical.compatibilityProjection.rangeMs).toBe(2000);
    expect(canonical.compatibilityProjection.boundsMinUs).toBe(1_000_000);
    expect(canonical.metadata.traceTopographyReduction).toMatchObject({ window: [1_000_000, 3_000_000], mode: "visualization" });
    assertTraceSessionConservation(stage.envelope, canonical);
    commitTraceSession(repository, stage, canonical);
    expect(repository.accounting.inFlightBytes).toBe(0);
    expect(stage.released).toBe(true);
    repository.dispose(id);
    expect(repository.accounting.totalBytes).toBe(0);
  });

  it("releases reservations on parsing failure and cancellation", async () => {
    const repository = new TraceSessionRepository();
    const id = sessionId("session:v1:bad-stream");
    await expect(ingestStreamingEnvelope(new Blob(['{"traceEvents":[']), id, repository, null, {})).rejects.toThrow();
    expect(repository.get(id).state).toBe("canceled");
    expect(repository.accounting.totalBytes).toBe(0);
    const abort = new AbortController();
    abort.abort();
    await expect(ingestStreamingEnvelope(new Blob(["[]"]), sessionId("session:v1:canceled-stream"), repository, null, { signal: abort.signal })).rejects.toThrow();
    expect(repository.accounting.totalBytes).toBe(0);
  });
});
