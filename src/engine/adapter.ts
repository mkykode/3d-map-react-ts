import * as Trace from "@paulirish/trace_engine";
import { classifyEvent, CAT_ID } from "./categories";
import type {
  ColumnarLane,
  FlowChain,
  LaneKind,
  LaneMeta,
  ParsedTraceModel,
  VitalMarker,
} from "./types";

/**
 * Structural view of the trace_engine result. The package ships the full
 * Chromium types, but they churn with Chrome releases; we pin our reads to
 * this narrow surface and cast once at the boundary.
 */
interface EngineEvent {
  ts: number;
  dur?: number;
  name: string;
  cat: string;
  pid: number;
  tid: number;
  args?: {
    dataUri?: string;
    snapshot?: string;
    data?: { jsHeapSizeUsed?: number; url?: string };
  };
}

interface EngineThread {
  name: string;
  entries: readonly EngineEvent[];
}

interface EngineProcess {
  url?: string | null;
  threads: Map<number, EngineThread>;
}

interface EngineData {
  Meta: { traceBounds: { min: number; max: number; range: number } };
  Renderer: {
    processes: Map<number, EngineProcess>;
    entryToNode: Map<EngineEvent, { depth: number; selfTime?: number }>;
  };
  Screenshots: {
    legacySyntheticScreenshots?: readonly EngineEvent[] | null;
    screenshots?: readonly EngineEvent[] | null;
  };
  PageLoadMetrics: { allMarkerEvents: readonly EngineEvent[] };
  Frames: {
    frames: readonly { startTime: number; endTime: number; dropped: boolean }[];
  };
  NetworkRequests: { byTime: readonly EngineEvent[] };
  Memory: { updateCountersByProcess: Map<number, readonly EngineEvent[]> };
  Flows: { flows: readonly (readonly EngineEvent[])[] };
  GPU: { mainGPUThreadTasks: readonly EngineEvent[] };
}

/** Lanes rendered at once; excess threads are counted, never silently lost. */
export const MAX_LANES = 12;
const MIN_LANE_ENTRIES = 25;

const MARKER_LABELS: Record<string, string> = {
  navigationStart: "Nav",
  firstPaint: "FP",
  firstContentfulPaint: "FCP",
  "largestContentfulPaint::Candidate": "LCP",
  MarkDOMContent: "DCL",
  MarkLoad: "Load",
};

/** trace_engine expects DOMRect; Node (Vitest) lacks it, browsers have it. */
function polyfillDomRect(): void {
  if (typeof globalThis.DOMRect === "function") return;
  class DOMRectPolyfill {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
    static fromRect(r?: { x?: number; y?: number; width?: number; height?: number }) {
      return new DOMRectPolyfill(r?.x, r?.y, r?.width, r?.height);
    }
    toJSON() {
      return { ...this };
    }
  }
  (globalThis as { DOMRect?: unknown }).DOMRect = DOMRectPolyfill;
}

interface CandidateLane {
  name: string;
  kind: LaneKind;
  processUrl?: string;
  entries: readonly EngineEvent[];
  /** Rank for stable ordering: main page first, network last. */
  order: number;
}

export async function parseTrace(
  traceEvents: unknown[],
): Promise<ParsedTraceModel> {
  polyfillDomRect();
  const started = performance.now();

  const model = Trace.TraceModel.Model.createWithAllHandlers();
  await model.parse(traceEvents as Parameters<typeof model.parse>[0]);
  const parsed: unknown = model.parsedTrace();
  if (!parsed) throw new Error("trace_engine returned no data");
  const data = (((parsed as { data?: unknown }).data ?? parsed) as EngineData);

  const boundsMinUs = data.Meta.traceBounds.min;
  const toMs = (us: number): number => (us - boundsMinUs) / 1000;
  const rangeMs = data.Meta.traceBounds.range / 1000;

  // ---- Collect candidate lanes from renderer threads -----------------------
  const candidates: CandidateLane[] = [];
  let totalThreads = 0;

  const processes = [...data.Renderer.processes.entries()];
  // Primary page = the process whose main thread has the most entries.
  const mainEntryCount = (p: EngineProcess): number =>
    [...p.threads.values()].find((t) => t.name === "CrRendererMain")?.entries
      .length ?? 0;
  processes.sort(([, a], [, b]) => mainEntryCount(b) - mainEntryCount(a));

  processes.forEach(([, proc], procIndex) => {
    const host = proc.url ? new URL(proc.url).host : `process ${procIndex}`;
    for (const thread of proc.threads.values()) {
      totalThreads++;
      if (thread.entries.length < MIN_LANE_ENTRIES) continue;
      const isMain = thread.name === "CrRendererMain";
      candidates.push({
        name: isMain ? `Main — ${host}` : `${thread.name} — ${host}`,
        kind: isMain ? "main" : "thread",
        processUrl: proc.url ?? undefined,
        entries: thread.entries,
        order: procIndex * 10 + (isMain ? 0 : 1),
      });
    }
  });

  if (data.GPU.mainGPUThreadTasks.length > 0) {
    totalThreads++;
    candidates.push({
      name: "GPU",
      kind: "gpu",
      entries: data.GPU.mainGPUThreadTasks,
      order: 90,
    });
  }
  if (data.NetworkRequests.byTime.length > 0) {
    candidates.push({
      name: "Network",
      kind: "network",
      entries: data.NetworkRequests.byTime,
      order: 100,
    });
  }

  candidates.sort(
    (a, b) => a.order - b.order || b.entries.length - a.entries.length,
  );
  const kept = [
    // Never drop the structural lanes (main/gpu/network); trim mid threads.
    ...candidates.filter((c) => c.kind !== "thread"),
    ...candidates.filter((c) => c.kind === "thread"),
  ]
    .slice(0, MAX_LANES)
    .sort((a, b) => a.order - b.order || b.entries.length - a.entries.length);

  // ---- Columnarize ----------------------------------------------------------
  const names: string[] = [];
  const nameIdByName = new Map<string, number>();
  const nameId = (n: string): number => {
    let id = nameIdByName.get(n);
    if (id === undefined) {
      id = names.length;
      names.push(n);
      nameIdByName.set(n, id);
    }
    return id;
  };

  const entryLocation = new Map<EngineEvent, { lane: number; idx: number }>();
  const lanes: ColumnarLane[] = kept.map((cand, laneIndex) => {
    const n = cand.entries.length;
    // Synthetic network requests never appear in entryToNode; give them
    // collision-free waterfall rows so concurrent requests don't overlap.
    const waterfallRows =
      cand.kind === "network" ? assignWaterfallRows(cand.entries) : null;
    const starts = new Float64Array(n);
    const durs = new Float64Array(n);
    const depths = new Uint16Array(n);
    const catIds = new Uint8Array(n);
    const selfTimes = new Float64Array(n);
    const nameIds = new Uint32Array(n);
    let maxDepth = 0;

    cand.entries.forEach((event, i) => {
      const node = data.Renderer.entryToNode.get(event);
      const depth = waterfallRows ? waterfallRows[i] : (node?.depth ?? 0);
      const durMs = (event.dur ?? 0) / 1000;
      starts[i] = toMs(event.ts);
      durs[i] = durMs;
      depths[i] = depth;
      catIds[i] =
        cand.kind === "network"
          ? CAT_ID.loading
          : cand.kind === "gpu"
            ? CAT_ID.gpu
            : classifyEvent(event.name, event.cat);
      selfTimes[i] = node?.selfTime !== undefined ? node.selfTime / 1000 : durMs;
      nameIds[i] =
        cand.kind === "network"
          ? nameId(requestLabel(event))
          : nameId(event.name);
      if (depth > maxDepth) maxDepth = depth;
      entryLocation.set(event, { lane: laneIndex, idx: i });
    });

    const meta: LaneMeta = {
      id: laneIndex,
      name: cand.name,
      kind: cand.kind,
      processUrl: cand.processUrl,
      entryCount: n,
      maxDepth,
    };
    return { meta, starts, durs, depths, catIds, selfTimes, nameIds };
  });

  // ---- Markers, screenshots, frames, memory, flows -------------------------
  const markers: VitalMarker[] = data.PageLoadMetrics.allMarkerEvents
    .filter((m) => MARKER_LABELS[m.name])
    .map((m) => ({ name: m.name, label: MARKER_LABELS[m.name], ts: toMs(m.ts) }));

  // Older traces populate legacySyntheticScreenshots; current Chrome emits
  // Screenshots.screenshots instead (dataUri, or raw base64 in snapshot).
  const legacyShots = data.Screenshots.legacySyntheticScreenshots ?? [];
  const modernShots = data.Screenshots.screenshots ?? [];
  const screenshots = (legacyShots.length > 0 ? legacyShots : modernShots)
    .map((s) => ({
      ts: toMs(s.ts),
      dataUri:
        s.args?.dataUri ??
        (s.args?.snapshot
          ? `data:image/jpeg;base64,${s.args.snapshot}`
          : ""),
    }))
    .filter((s) => s.dataUri.length > 0);

  const frames = data.Frames.frames.map((f) => ({
    start: toMs(f.startTime),
    end: toMs(f.endTime),
    dropped: f.dropped,
  }));

  const requests = data.NetworkRequests.byTime.map((r) => ({
    start: toMs(r.ts),
    end: toMs(r.ts + (r.dur ?? 0)),
    url: r.args?.data?.url ?? "",
  }));

  // One process only: mixing heaps from iframes would draw a false river.
  const primaryPid = processes[0]?.[0];
  const memory = [
    ...(primaryPid !== undefined
      ? (data.Memory.updateCountersByProcess.get(primaryPid) ?? [])
      : []),
  ]
    .map((e) => ({
      ts: toMs(e.ts),
      jsHeapUsed: e.args?.data?.jsHeapSizeUsed ?? 0,
    }))
    .filter((m) => m.jsHeapUsed > 0)
    .sort((a, b) => a.ts - b.ts);

  const flows: FlowChain[] = data.Flows.flows
    .map((chain) => ({
      points: chain
        .map((e) => entryLocation.get(e))
        .filter((p): p is { lane: number; idx: number } => p !== undefined),
    }))
    .filter((f) => f.points.length >= 2);

  return {
    boundsMinUs,
    rangeMs,
    lanes,
    names,
    markers,
    screenshots,
    frames,
    requests,
    memory,
    flows,
    totalThreads,
    parseMs: Math.round(performance.now() - started),
  };
}

/** Greedy interval coloring: each request takes the first row that is free. */
function assignWaterfallRows(entries: readonly EngineEvent[]): number[] {
  const rowEnds: number[] = [];
  return entries.map((event) => {
    const start = event.ts;
    const end = event.ts + (event.dur ?? 0);
    for (let row = 0; row < rowEnds.length; row++) {
      if (rowEnds[row] <= start) {
        rowEnds[row] = end;
        return row;
      }
    }
    rowEnds.push(end);
    return rowEnds.length - 1;
  });
}

function requestLabel(event: EngineEvent): string {
  const url = event.args?.data?.url;
  if (!url) return event.name;
  try {
    const u = new URL(url);
    const tail = u.pathname.split("/").filter(Boolean).pop() ?? u.host;
    return `${u.host}/${tail}`;
  } catch {
    return url.slice(0, 60);
  }
}
