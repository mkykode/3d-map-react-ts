import { STREAM_LIMITS, WINDOW_REQUIRED } from "./budget.ts";
import type { TraceEvent, TraceReduction, TraceWindow } from "./types.ts";

export function bookkeepingEvent(event: TraceEvent): boolean {
  return event.name === "v8.callFunction" || event.name.startsWith("v8::Debugger::") ||
    event.cat?.split(",").every((cat) => cat === "disabled-by-default-v8.inspector") === true;
}

export function sourceEvent(event: TraceEvent): boolean {
  return event.cat?.split(",").some((cat) => cat === "disabled-by-default-devtools.v8-source-rundown" || cat === "disabled-by-default-devtools.v8-source-rundown-sources") === true;
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

interface ProfileClock {
  original: number;
  retained: number;
  sourceIndex: number;
  sampleIndexes: Map<number, number>;
  active: boolean;
}

/** A visualization reduction, deliberately not an exact-evidence transform. */
export class TraceFilter {
  readonly report: TraceReduction;
  private readonly profiles = new Map<string, ProfileClock>();
  private readonly stacks = new Map<string, TraceEvent[]>();
  private contextBytes = 0;
  private readonly emit: (event: TraceEvent) => void;
  private readonly window: TraceWindow | null;

  constructor(emit: (event: TraceEvent) => void, window: TraceWindow | null = null) {
    this.emit = emit;
    this.window = window;
    if (window && (!window.every(Number.isFinite) || window[0] < 0 || window[1] <= window[0])) throw new Error("Invalid trace time window.");
    this.report = {
      version: 1, mode: "visualization", sourceEventCount: 0, retainedEventCount: 0,
      droppedBookkeeping: 0, droppedSourceEvents: 0, outsideWindow: 0,
      omittedEnvelopeFields: [], window, importSha256: "", payloadSha256: "",
    };
  }

  accept(event: TraceEvent): void {
    this.report.sourceEventCount++;
    if (sourceEvent(event)) { this.report.droppedSourceEvents++; return; }
    if (bookkeepingEvent(event)) { this.report.droppedBookkeeping++; return; }
    if (!this.window) { this.output(event); return; }
    const [start, end] = this.window;
    const inside = event.ts >= start && event.ts < end;
    if (event.name === "Profile" || event.name === "ProfileChunk") {
      this.profile(event);
      return;
    }
    if (event.name === "CpuProfile") throw new Error("Windowed standalone CPU profiles are not supported. Load this profile without a window.");
    if (event.ph === "M") { this.output({ ...event, ts: start }); return; }
    if (["TracingStartedInBrowser", "TracingStartedInPage", "FrameCommittedInBrowser", "CommitLoad"].includes(event.name)) {
      if (event.ts < end) this.output({ ...event, ts: Math.max(start, event.ts) });
      else this.report.outsideWindow++;
      return;
    }
    // Reconstruct synchronous B/E spans before clipping. Unmatched ends are not invented.
    if (event.ph === "B" || event.ph === "E") {
      const key = `${event.pid}:${event.tid}`;
      const stack = this.stacks.get(key) ?? [];
      if (event.ph === "B") {
        this.contextBytes += JSON.stringify(event).length * 2;
        if (this.contextBytes > STREAM_LIMITS.valueBytes || stack.length >= STREAM_LIMITS.nesting) throw new Error(WINDOW_REQUIRED);
        stack.push(event);
        this.stacks.set(key, stack);
      } else {
        const begin = stack.pop();
        if (begin) {
          this.contextBytes -= JSON.stringify(begin).length * 2;
          this.span({ ...begin, ph: "X", dur: Math.max(0, event.ts - begin.ts) });
        }
        if (!stack.length) this.stacks.delete(key);
      }
      return;
    }
    if (event.ph === "X") { this.span(event); return; }
    if (inside) this.output(event);
    else this.report.outsideWindow++;
  }

  private span(event: TraceEvent): void {
    const [start, end] = this.window!;
    const clippedStart = Math.max(start, event.ts);
    const clippedEnd = Math.min(end, event.ts + (event.dur ?? 0));
    if (clippedEnd > clippedStart || (event.dur === 0 && event.ts >= start && event.ts < end)) {
      this.output({ ...event, ts: clippedStart, dur: clippedEnd - clippedStart });
    } else this.report.outsideWindow++;
  }

  private profile(event: TraceEvent): void {
    const [start, end] = this.window!;
    // Chromium groups profiles by process and profile id, not the chunk thread.
    const key = `${event.pid}:${String(event.id)}`;
    if (event.name === "Profile") {
      if (this.profiles.size >= 4096) throw new Error("CPU profile count limit exceeded.");
      this.profiles.set(key, { original: event.ts, retained: Math.max(start, event.ts), sourceIndex: 0, sampleIndexes: new Map(), active: event.ts < end });
      if (event.ts < end) this.output({ ...event, ts: Math.max(start, event.ts) });
      return;
    }
    const clock = this.profiles.get(key);
    if (!clock) throw new Error("A CPU profile chunk precedes its header. Prepare or re-export the trace before selecting a window.");
    if (!clock.active) { this.report.outsideWindow++; return; }
    const data = record(event.args?.data);
    const cpu = record(data.cpuProfile);
    const samples = Array.isArray(cpu.samples) ? cpu.samples : [];
    const deltas = Array.isArray(data.timeDeltas) ? data.timeDeltas : [];
    if (samples.length !== deltas.length) throw new Error("CPU sample and time-delta counts differ.");
    const keep: number[] = [];
    const selectedDeltas: number[] = [];
    for (let i = 0; i < deltas.length; i++) {
      const delta: unknown = deltas[i];
      // Chromium accepts clock corrections and sorts the resulting timestamps.
      if (typeof delta !== "number" || !Number.isFinite(delta)) throw new Error("Invalid CPU profile time delta.");
      clock.original += delta;
      if (!Number.isFinite(clock.original)) throw new Error("CPU profile timestamp overflow.");
      if (clock.original >= start && clock.original < end) {
        clock.sampleIndexes.set(clock.sourceIndex, clock.sampleIndexes.size);
        keep.push(i);
        selectedDeltas.push(clock.original - clock.retained);
        clock.retained = clock.original;
      }
      clock.sourceIndex++;
    }
    const nodes = Array.isArray(cpu.nodes) ? cpu.nodes : [];
    if (keep.length === 0 && nodes.length === 0) { this.report.outsideWindow++; return; }
    // Node definitions may appear before or after the selected samples. Keep all
    // definitions, under the same retained-data budget, without shifting samples.
    const nextCpu: Record<string, unknown> = { ...cpu, samples: keep.map((i) => samples[i]) };
    if (Array.isArray(cpu.nodes)) nextCpu.nodes = nodes.map((node) => {
      const selectedNode = { ...record(node) };
      // Full-recording counts must be recomputed from the selected samples.
      delete selectedNode.hitCount;
      delete selectedNode.positionTicks;
      return selectedNode;
    });
    if (cpu.trace_ids !== undefined) {
      const traceIds: Record<string, unknown> = {};
      for (const [sourceIndex, traceId] of Object.entries(record(cpu.trace_ids))) {
        const index = clock.sampleIndexes.get(Number(sourceIndex));
        if (index !== undefined) traceIds[index] = traceId;
      }
      nextCpu.trace_ids = traceIds;
    }
    const nextData: Record<string, unknown> = { ...data, cpuProfile: nextCpu, timeDeltas: selectedDeltas };
    for (const name of ["lines", "columns"]) {
      const values = data[name];
      if (Array.isArray(values)) nextData[name] = keep.map((i) => values[i]);
    }
    this.output({ ...event, ts: Math.min(end - 1, Math.max(start, event.ts)), args: { ...event.args, data: nextData } });
  }

  private output(event: TraceEvent): void {
    this.report.retainedEventCount++;
    this.emit(event);
  }
}
