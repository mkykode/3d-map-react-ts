import { openAsBlob } from "node:fs";
import { expect, it } from "vitest";
import { prepareTrace } from "./prepare";
import { parseTraceForSession } from "../adapter";
import type { TraceWindow } from "./types";

// Opt-in only: private traces never become fixtures or part of CI artifacts.
it.skipIf(!process.env.TRACE_IMPORT_FILE)("calibrates a local streaming import through the real engine", async () => {
  const started = performance.now();
  const window = process.env.TRACE_IMPORT_WINDOW_US?.split(",").map(Number) as TraceWindow | undefined;
  const prepared = await prepareTrace(await openAsBlob(process.env.TRACE_IMPORT_FILE!), window ?? null);
  const preparedMs = performance.now() - started;
  const result = await parseTraceForSession(prepared.traceEvents, { window });
  expect(result.projection.lanes.length).toBeGreaterThan(0);
  for (const lane of result.projection.lanes) {
    expect([...lane.starts, ...lane.durs, ...lane.selfTimes].every(Number.isFinite)).toBe(true);
    expect([...lane.durs].every((duration) => duration >= 0)).toBe(true);
  }
  console.log("Streaming import calibration", JSON.stringify({
    preparedMs: Math.round(preparedMs), engineMs: result.projection.parseMs,
    retainedJsonBytes: prepared.retainedBytes, retainedEvents: prepared.traceEvents.length,
    renderedEvents: result.projection.lanes.reduce((sum, lane) => sum + lane.meta.entryCount, 0),
    rangeMs: result.projection.rangeMs, memory: process.memoryUsage(), maxRssKiB: process.resourceUsage().maxRSS,
  }));
}, 180_000);
