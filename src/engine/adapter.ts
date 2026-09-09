import * as Trace from "@paulirish/trace_engine";
import { classifyEvent, CAT_ID } from "./categories";
import { MAX_LANES } from "./constants";
import type {
  CallFrameInfo,
  ColumnarLane,
  DocumentFrameInfo,
  FlowChain,
  LaneKind,
  LaneMeta,
  NavigationInfo,
  ParsedTraceModel,
  ProcessInfo,
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
  ph?: string;
  pid: number;
  tid: number;
  callFrame?: {
    functionName: string;
    scriptId: string | number;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  rawSourceEvent?: EngineEvent;
  args?: {
    context?: {
      performanceTimelineNavigationId: number;
      URL: string;
    };
    name?: string;
    frame?: string;
    dataUri?: string;
    snapshot?: string;
    data?: {
      documentLoaderURL?: string;
      frame?: string;
      frameId?: string;
      isLoadingMainFrame?: boolean;
      isOutermostMainFrame?: boolean;
      jsHeapSizeUsed?: number;
      navigationId?: string;
      url?: string;
      renderBlocking?: string;
      requestMethod?: string;
    };
  };
}

interface EngineTraceNode {
  entry: EngineEvent;
  depth: number;
  selfTime?: number;
  parent: EngineTraceNode | null;
  children: EngineTraceNode[];
}

interface EngineThread {
  name: string | null;
  entries: readonly EngineEvent[];
}

interface EngineProcess {
  url?: string | null;
  isOnMainFrame: boolean;
  threads: Map<number, EngineThread>;
}

interface EnginePageFrame extends EngineEvent {
  frame: string;
  parent?: string;
  processId: number;
  url: string;
  isOutermostMainFrame?: boolean;
  isInPrimaryMainFrame?: boolean;
}

interface EngineFrameProcessWindow {
  frame: EnginePageFrame;
  window: { min: number; max: number; range: number };
}

interface EngineTimelineFrame extends EngineEvent {
  startTime: number;
  endTime: number;
  dropped: boolean;
}

interface EngineMetricScore {
  event?: EngineEvent;
}

interface EngineData {
  Meta: {
    traceBounds: { min: number; max: number; range: number };
    traceIsGeneric: boolean;
    browserProcessId: number;
    gpuProcessId: number;
    gpuThreadId?: number;
    processNames: Map<number, EngineEvent>;
    mainFrameId: string;
    mainFrameURL: string;
    mainFrameNavigations: EngineEvent[];
    navigationsByFrameId: Map<string, EngineEvent[]>;
    softNavigationsById: Map<number, EngineEvent>;
    finalDisplayUrlByNavigationId: Map<string, string>;
    rendererProcessesByFrame: Map<
      string,
      Map<number, EngineFrameProcessWindow[]>
    >;
  };
  Renderer: {
    processes: Map<number, EngineProcess>;
    entryToNode: Map<EngineEvent, EngineTraceNode>;
  };
  Screenshots: {
    legacySyntheticScreenshots?: readonly EngineEvent[] | null;
    screenshots?: readonly EngineEvent[] | null;
  };
  PageLoadMetrics: {
    allMarkerEvents: readonly EngineEvent[];
    metricScoresByFrameId: Map<
      string,
      Map<EngineEvent, Map<string, EngineMetricScore>>
    >;
  };
  Frames: {
    frames: readonly EngineTimelineFrame[];
  };
  NetworkRequests: { byTime: readonly EngineEvent[] };
  Memory: { updateCountersByProcess: Map<number, readonly EngineEvent[]> };
  Flows: { flows: readonly (readonly EngineEvent[])[] };
  GPU: { mainGPUThreadTasks: readonly EngineEvent[] };
  AnimationFrames: { animationFrames: readonly EngineEvent[] };
  UserInteractions: { interactionEvents: readonly EngineEvent[] };
  LayoutShifts: { clusters: readonly EngineEvent[] };
  UserTimings: {
    performanceMeasures: readonly EngineEvent[];
    performanceMarks: readonly EngineEvent[];
    consoleTimings: readonly EngineEvent[];
    timestampEvents: readonly EngineEvent[];
  };
}

export interface CanonicalEventRecord {
  key: string;
  name: string;
  category: string;
  phase: string;
  processId: number;
  threadId: number;
  startMs: number;
  durationMs: number;
  data: Readonly<Record<string, unknown>>;
}

export type CanonicalSourceFrame = Omit<
  CallFrameInfo,
  "functionNameId" | "urlId"
> & {
  functionName: string;
  scriptUrl: string;
};

export interface CanonicalSourceSample {
  frame: CanonicalSourceFrame;
  startMs: number;
  durationMs: number;
  selfTimeMs: number;
  eventKey: string | null;
  exclusiveSpans: readonly (readonly [startMs: number, endMs: number])[];
}

export interface AdapterCanonicalEvidence {
  eventCount: number;
  events: CanonicalEventRecord[];
  sourceFrames: CanonicalSourceFrame[];
  sourceSamples: CanonicalSourceSample[];
  animationFrames: CanonicalEventRecord[];
  interactions: CanonicalEventRecord[];
  layoutShifts: CanonicalEventRecord[];
  userTimings: CanonicalEventRecord[];
  metrics: VitalMarker[];
  navigations: NavigationInfo[];
  requests: ParsedTraceModel["requests"];
  frames: ParsedTraceModel["frames"];
  memory: ParsedTraceModel["memory"];
  screenshots: ParsedTraceModel["screenshots"];
}

export interface AdapterTraceResult {
  projection: ParsedTraceModel;
  canonicalEvidence: AdapterCanonicalEvidence;
}

export interface AdapterParseOptions {
  onMemoryStage?: (stage: "trace-engine" | "canonicalized") => void;
  window?: readonly [number, number];
}

interface EngineEventsSerializer {
  keyForEvent(event: EngineEvent): string | null;
}

const MIN_LANE_ENTRIES = 25;

const MARKER_LABELS: Partial<Record<string, string>> = {
  navigationStart: "Nav",
  SoftNavigationStart: "Nav",
  firstPaint: "FP",
  firstContentfulPaint: "FCP",
  "largestContentfulPaint::Candidate": "LCP",
  "largestContentfulPaint::CandidateForSoftNavigation": "LCP",
  MarkDOMContent: "DCL",
  MarkLoad: "Load",
};

export function markerLabelForEvent(name: string): string | undefined {
  return MARKER_LABELS[name];
}

export function selectDefaultNavigationId(
  navigations: readonly Pick<NavigationInfo, "id" | "frameId" | "start">[],
  mainFrameId: string | null,
): string | null {
  if (!mainFrameId) return null;
  let earliest: (typeof navigations)[number] | null = null;
  for (const navigation of navigations) {
    if (
      navigation.frameId === mainFrameId &&
      (!earliest || navigation.start < earliest.start)
    ) {
      earliest = navigation;
    }
  }
  return earliest?.id ?? null;
}

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
  processId?: number;
  threadId?: number;
  entries: readonly EngineEvent[];
  /** Rank for stable ordering: main page first, network last. */
  order: number;
}

function createStringTable() {
  const values: string[] = [];
  const idByValue = new Map<string, number>();
  return {
    values,
    id(value: string): number {
      let id = idByValue.get(value);
      if (id === undefined) {
        id = values.length;
        values.push(value);
        idByValue.set(value, id);
      }
      return id;
    },
  };
}

export async function parseTrace(traceEvents: unknown[]): Promise<ParsedTraceModel> {
  return (await parseTraceForSession(traceEvents)).projection;
}

export async function parseTraceForSession(
  traceEvents: unknown[],
  options?: AdapterParseOptions,
): Promise<AdapterTraceResult> {
  polyfillDomRect();
  const started = performance.now();
  const rawEventIndex = new Map(
    (traceEvents as EngineEvent[]).map((event, index) => [event, index]),
  );

  const config = {
    ...Trace.Types.Configuration.defaults(),
    enableAnimationsFrameHandler: true,
  };
  const model = Trace.TraceModel.Model.createWithAllHandlers(config);
  await model.parse(traceEvents as Parameters<typeof model.parse>[0]);
  const parsed: unknown = model.parsedTrace();
  if (!parsed) throw new Error("trace_engine returned no data");
  const data = (((parsed as { data?: unknown }).data ?? parsed) as EngineData);
  const animationFrames = await collectAnimationFrames(
    traceEvents as EngineEvent[],
    config,
  );
  options?.onMemoryStage?.("trace-engine");

  const boundsMinUs = options?.window?.[0] ?? data.Meta.traceBounds.min;
  const toMs = (us: number): number => (us - boundsMinUs) / 1000;
  const rangeMs = options?.window ? (options.window[1] - options.window[0]) / 1000 : data.Meta.traceBounds.range / 1000;
  const navigationId = (navigation: EngineEvent): string | null => {
    const hardId = navigation.args?.data?.navigationId;
    if (hardId) return hardId;
    const softId = navigation.args?.context?.performanceTimelineNavigationId;
    return softId === undefined ? null : `soft:${softId}`;
  };
  const navigationEventsByFrame = new Map<string, EngineEvent[]>();
  for (const [frameId, frameNavigations] of data.Meta.navigationsByFrameId) {
    navigationEventsByFrame.set(frameId, [...frameNavigations]);
  }
  for (const navigation of data.Meta.softNavigationsById.values()) {
    const frameId = navigation.args?.frame;
    if (!frameId) continue;
    const frameNavigations = navigationEventsByFrame.get(frameId) ?? [];
    frameNavigations.push(navigation);
    navigationEventsByFrame.set(frameId, frameNavigations);
  }
  const mainFrameNavigationEvents =
    navigationEventsByFrame.get(data.Meta.mainFrameId) ??
    data.Meta.mainFrameNavigations;
  const primaryNavigation = [...mainFrameNavigationEvents]
    .sort((a, b) => a.ts - b.ts)
    .find(
      (navigation) =>
        navigationId(navigation) !== null &&
        Boolean(
          navigation.args?.context?.URL ??
            navigation.args?.data?.documentLoaderURL,
        ),
    );
  const primaryProcessId = primaryNavigation?.pid;

  // ---- Collect candidate lanes from renderer threads -----------------------
  const candidates: CandidateLane[] = [];
  let totalThreads = 0;

  const rendererProcesses = [...data.Renderer.processes.entries()];
  const mainEntryCount = (p: EngineProcess): number =>
    [...p.threads.values()].find((t) => t.name === "CrRendererMain")?.entries
      .length ?? 0;
  rendererProcesses.sort(
    ([pidA, a], [pidB, b]) =>
      Number(pidB === primaryProcessId) - Number(pidA === primaryProcessId) ||
      Number(b.isOnMainFrame) - Number(a.isOnMainFrame) ||
      mainEntryCount(b) - mainEntryCount(a),
  );

  rendererProcesses.forEach(([pid, proc], procIndex) => {
    const host = proc.url ? new URL(proc.url).host : `process ${procIndex}`;
    for (const [tid, thread] of proc.threads) {
      totalThreads++;
      if (thread.entries.length < MIN_LANE_ENTRIES) continue;
      const isMain = thread.name === "CrRendererMain";
      candidates.push({
        name: isMain
          ? `Main — ${host}`
          : `${thread.name ?? `Thread ${tid}`} — ${host}`,
        kind: isMain ? "main" : "thread",
        processId: pid,
        threadId: tid,
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
      processId:
        data.Meta.gpuProcessId >= 0 ? data.Meta.gpuProcessId : undefined,
      threadId: data.Meta.gpuThreadId,
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
  const eventNames = createStringTable();
  const functionNameTable = createStringTable();
  const scriptUrlTable = createStringTable();
  const eventKeyTable = createStringTable();
  const eventsSerializer =
    new Trace.EventsSerializer.EventsSerializer() as unknown as EngineEventsSerializer;
  const stableEventKey = (event: EngineEvent): string | null => {
    const serialized = eventsSerializer.keyForEvent(event);
    if (serialized) return serialized;
    if (event.name === "JSSample") return null;
    const rawIndex = rawEventIndex.get(event.rawSourceEvent ?? event);
    if (rawIndex === undefined) return null;
    const type = event.rawSourceEvent
      ? Trace.Types.File.EventKeyType.SYNTHETIC_EVENT
      : Trace.Types.File.EventKeyType.RAW_EVENT;
    return `${type}-${rawIndex}`;
  };
  const callFrames: CallFrameInfo[] = [];
  const callFrameIdByKey = new Map<string, number>();
  const callFrameId = (frame: NonNullable<EngineEvent["callFrame"]>): number => {
    const functionName = frame.functionName || "(anonymous)";
    const scriptId = String(frame.scriptId);
    const key = [
      functionName,
      scriptId,
      frame.url,
      frame.lineNumber,
      frame.columnNumber,
    ].join("\0");
    let id = callFrameIdByKey.get(key);
    if (id === undefined) {
      callFrames.push({
        functionNameId: functionNameTable.id(functionName),
        urlId: scriptUrlTable.id(frame.url),
        scriptId,
        lineNumber: frame.lineNumber,
        columnNumber: frame.columnNumber,
      });
      id = callFrames.length;
      callFrameIdByKey.set(key, id);
    }
    return id;
  };
  const sourceSamples: CanonicalSourceSample[] = rendererProcesses.flatMap(([, process]) =>
    [...process.threads.values()].flatMap((thread) => thread.entries.flatMap((event) => {
      if (!event.callFrame) return [];
      const node = data.Renderer.entryToNode.get(event);
      const startMs = toMs(event.ts);
      const durationMs = (event.dur ?? 0) / 1000;
      const eventEndMs = startMs + durationMs;
      let cursorMs = startMs;
      const exclusiveSpans: [number, number][] = [];
      for (const child of node?.children ?? []) {
        const childStartMs = Math.max(startMs, toMs(child.entry.ts));
        const childEndMs = Math.min(
          eventEndMs,
          toMs(child.entry.ts + (child.entry.dur ?? 0)),
        );
        if (childStartMs > cursorMs) exclusiveSpans.push([cursorMs, childStartMs]);
        cursorMs = Math.max(cursorMs, childEndMs);
      }
      if (cursorMs < eventEndMs) exclusiveSpans.push([cursorMs, eventEndMs]);
      return [{
        frame: {
          functionName: event.callFrame.functionName || "(anonymous)",
          scriptUrl: event.callFrame.url,
          scriptId: String(event.callFrame.scriptId),
          lineNumber: event.callFrame.lineNumber,
          columnNumber: event.callFrame.columnNumber,
        },
        startMs,
        durationMs,
        selfTimeMs: node?.selfTime !== undefined ? node.selfTime / 1000 : durationMs,
        eventKey: stableEventKey(event),
        exclusiveSpans,
      }];
    })),
  );

  const entryLocation = new Map<EngineEvent, { lane: number; idx: number }>();
  const lanes: ColumnarLane[] = kept.map((cand, laneIndex) => {
    const n = cand.entries.length;
    const entryIndexes = new Map(cand.entries.map((event, index) => [event, index]));
    // Synthetic network requests never appear in entryToNode; give them
    // collision-free waterfall rows so concurrent requests don't overlap.
    const waterfallRows =
      cand.kind === "network" ? assignWaterfallRows(cand.entries) : null;
    const starts = new Float64Array(n);
    const durs = new Float64Array(n);
    const depths = new Uint16Array(n);
    const catIds = new Uint8Array(n);
    const selfTimes = new Float64Array(n);
    const parentIndexes = new Int32Array(n).fill(-1);
    const nameIds = new Uint32Array(n);
    const callFrameIds = new Uint32Array(n);
    const eventKeyIds = new Uint32Array(n);
    let maxDepth = 0;
    let maxDur = 0;

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
      const parentIndex = node?.parent
        ? entryIndexes.get(node.parent.entry)
        : undefined;
      if (parentIndex !== undefined) parentIndexes[i] = parentIndex;
      nameIds[i] =
        cand.kind === "network"
          ? eventNames.id(requestLabel(event))
          : eventNames.id(event.name);
      if (event.callFrame) callFrameIds[i] = callFrameId(event.callFrame);
      const eventKey = stableEventKey(event);
      if (eventKey) eventKeyIds[i] = eventKeyTable.id(eventKey) + 1;
      if (depth > maxDepth) maxDepth = depth;
      if (durMs > maxDur) maxDur = durMs;
      entryLocation.set(event, { lane: laneIndex, idx: i });
    });

    // Build exact uncovered spans from the trace_engine hierarchy.
    const exclusiveOffsets = new Uint32Array(n + 1);
    const exclusiveStarts: number[] = [];
    const exclusiveEnds: number[] = [];
    for (let i = 0; i < n; i++) {
      exclusiveOffsets[i] = exclusiveStarts.length;
      const eventStart = starts[i];
      const eventEnd = eventStart + durs[i];
      let cursor = eventStart;
      const node = data.Renderer.entryToNode.get(cand.entries[i]);
      for (const child of node?.children ?? []) {
        const childIndex = entryIndexes.get(child.entry);
        if (childIndex === undefined) continue;
        const childStart = Math.max(eventStart, starts[childIndex]);
        const childEnd = Math.min(
          eventEnd,
          starts[childIndex] + durs[childIndex],
        );
        if (childEnd <= cursor || childStart >= eventEnd) continue;
        if (childStart > cursor) {
          exclusiveStarts.push(cursor);
          exclusiveEnds.push(childStart);
        }
        cursor = Math.max(cursor, childEnd);
      }
      if (cursor < eventEnd) {
        exclusiveStarts.push(cursor);
        exclusiveEnds.push(eventEnd);
      }
    }
    exclusiveOffsets[n] = exclusiveStarts.length;

    const meta: LaneMeta = {
      id: laneIndex,
      name: cand.name,
      kind: cand.kind,
      processId: cand.processId,
      threadId: cand.threadId,
      entryCount: n,
      maxDepth,
      maxDur,
    };
    return {
      meta,
      starts,
      durs,
      depths,
      catIds,
      selfTimes,
      parentIndexes,
      exclusiveOffsets,
      exclusiveStarts: Float64Array.from(exclusiveStarts),
      exclusiveEnds: Float64Array.from(exclusiveEnds),
      nameIds,
      callFrameIds,
      eventKeyIds,
    };
  });

  // ---- Ownership, markers, screenshots, frames, memory, flows --------------
  const navigationOwnership = new Map<
    EngineEvent,
    { navigationId: string; frameId: string }
  >();
  for (const [frameId, frameNavigations] of navigationEventsByFrame) {
    for (const navigation of frameNavigations) {
      const id = navigationId(navigation);
      if (id) {
        navigationOwnership.set(navigation, { navigationId: id, frameId });
      }
    }
  }
  for (const [frameId, metricsByNavigation] of data.PageLoadMetrics
    .metricScoresByFrameId) {
    for (const [navigation, scores] of metricsByNavigation) {
      const id = navigationId(navigation);
      if (!id) continue;
      for (const score of scores.values()) {
        if (score.event) {
          navigationOwnership.set(score.event, { navigationId: id, frameId });
        }
      }
    }
  }

  const processIds = new Set<number>(data.Meta.processNames.keys());
  const frameWindowsByProcess = new Map<number, EngineFrameProcessWindow[]>();
  for (const processWindows of data.Meta.rendererProcessesByFrame.values()) {
    for (const [processId, entries] of processWindows) {
      processIds.add(processId);
      const knownEntries = frameWindowsByProcess.get(processId) ?? [];
      knownEntries.push(...entries);
      frameWindowsByProcess.set(processId, knownEntries);
    }
  }
  for (const [pid] of rendererProcesses) processIds.add(pid);
  if (data.Meta.browserProcessId >= 0) processIds.add(data.Meta.browserProcessId);
  if (data.Meta.gpuProcessId >= 0) processIds.add(data.Meta.gpuProcessId);
  const mainFrameProcessIds = new Set(
    data.Meta.rendererProcessesByFrame.get(data.Meta.mainFrameId)?.keys() ?? [],
  );
  const processes: ProcessInfo[] = [...processIds]
    .map((id) => {
      const renderer = data.Renderer.processes.get(id);
      const frameWindows = frameWindowsByProcess.get(id) ?? [];
      return {
        id,
        name: data.Meta.processNames.get(id)?.args?.name,
        url:
          renderer?.url ??
          frameWindows.find((entry) => entry.frame.url)?.frame.url,
        isOnMainFrame:
          renderer?.isOnMainFrame ?? mainFrameProcessIds.has(id),
        isBrowser:
          data.Meta.browserProcessId >= 0 && id === data.Meta.browserProcessId,
        isGpu: data.Meta.gpuProcessId >= 0 && id === data.Meta.gpuProcessId,
      };
    })
    .sort((a, b) => a.id - b.id);

  const documentFrames: DocumentFrameInfo[] = [
    ...data.Meta.rendererProcessesByFrame,
  ].map(([id, processWindows]) => {
    const windows = [...processWindows].flatMap(([processId, entries]) =>
      entries.map((entry) => ({ processId, ...entry })),
    );
    return {
      id,
      parentId: windows.find((window) => window.frame.parent)?.frame.parent,
      name:
        windows.find((window) => window.frame.name)?.frame.name ?? "",
      isOutermostMainFrame: combinedFlag(
        windows.map((window) => window.frame.isOutermostMainFrame),
      ),
      isInPrimaryMainFrame: combinedFlag(
        windows.map((window) => window.frame.isInPrimaryMainFrame),
      ),
      processWindows: windows
        .map((entry) => ({
          processId: entry.processId,
          url: entry.frame.url,
          start: toMs(entry.window.min),
          end: toMs(entry.window.max),
        }))
        .filter((window) => window.end >= window.start)
        .sort((a, b) => a.start - b.start),
    };
  });

  const navigations: NavigationInfo[] = [...navigationEventsByFrame]
    .flatMap(([frameId, frameNavigations]) => {
      const ordered = [...frameNavigations].sort((a, b) => a.ts - b.ts);
      return ordered.flatMap((navigation, index): NavigationInfo[] => {
        const id = navigationId(navigation);
        const softUrl = navigation.args?.context?.URL;
        const hardUrl = navigation.args?.data?.documentLoaderURL;
        const url = softUrl ?? hardUrl;
        if (!id || !url) return [];
        const kind = softUrl === undefined ? "hard" : "soft";
        return [
          {
            kind,
            id,
            frameId,
            processId: navigation.pid,
            emittingThreadId: navigation.tid,
            start: toMs(navigation.ts),
            end: toMs(ordered[index + 1]?.ts ?? data.Meta.traceBounds.max),
            url:
              kind === "soft"
                ? url
                : (data.Meta.finalDisplayUrlByNavigationId.get(id) ?? url),
            isOutermostMainFrame:
              navigation.args?.data?.isOutermostMainFrame,
            isLoadingMainFrame: navigation.args?.data?.isLoadingMainFrame,
          },
        ];
      });
    })
    .sort((a, b) => a.start - b.start);
  const defaultNavigationId = selectDefaultNavigationId(
    navigations,
    data.Meta.mainFrameId || null,
  );

  const markers: VitalMarker[] = data.PageLoadMetrics.allMarkerEvents
    .flatMap((m): VitalMarker[] => {
      const label = markerLabelForEvent(m.name);
      if (!label) return [];
      const ownership = navigationOwnership.get(m);
      return [
        {
          name: m.name,
          label,
          ts: toMs(m.ts),
          navigationId:
            ownership?.navigationId ?? m.args?.data?.navigationId,
          frameId:
            ownership?.frameId ?? m.args?.frame ?? m.args?.data?.frame,
          processId: m.pid,
          threadId: m.tid,
          eventKey: stableEventKey(m),
        },
      ];
    });

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
    eventKey: stableEventKey(f),
  }));

  const requests = data.NetworkRequests.byTime.map((r) => ({
    start: toMs(r.ts),
    end: toMs(r.ts + (r.dur ?? 0)),
    url: r.args?.data?.url ?? "",
    method: r.args?.data?.requestMethod ?? null,
    eventKey: stableEventKey(r),
    renderBlocking: isRenderBlocking(r.args?.data?.renderBlocking),
  }));

  // One process only: mixing heaps from iframes would draw a false river.
  const memoryProcessCandidates = [
    primaryProcessId,
    ...rendererProcesses
      .filter(([, process]) => process.isOnMainFrame)
      .map(([pid]) => pid),
    ...rendererProcesses.map(([pid]) => pid),
  ].filter((pid): pid is number => pid !== undefined);
  const primaryPid = memoryProcessCandidates.find(
    (pid) => (data.Memory.updateCountersByProcess.get(pid)?.length ?? 0) > 0,
  );
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

  const projection: ParsedTraceModel = {
    boundsMinUs,
    rangeMs,
    lanes,
    names: eventNames.values,
    functionNames: functionNameTable.values,
    scriptUrls: scriptUrlTable.values,
    callFrames,
    eventKeys: eventKeyTable.values,
    processes,
    documentFrames,
    navigations,
    mainFrameId: data.Meta.mainFrameId || null,
    mainFrameUrl: data.Meta.mainFrameURL || null,
    defaultNavigationId,
    markers,
    screenshots,
    frames,
    requests,
    memory,
    flows,
    totalThreads,
    parseMs: Math.round(performance.now() - started),
  };

  const result: AdapterTraceResult = {
    projection,
    canonicalEvidence: {
      eventCount: traceEvents.length,
      events: (traceEvents as EngineEvent[]).map((event, index) =>
        canonicalEvent(event, `raw-${index}`, boundsMinUs),
      ),
      sourceFrames: callFrames.map((frame) => ({
        functionName: functionNameTable.values[frame.functionNameId],
        scriptUrl: scriptUrlTable.values[frame.urlId],
        scriptId: frame.scriptId,
        lineNumber: frame.lineNumber,
        columnNumber: frame.columnNumber,
      })),
      sourceSamples,
      animationFrames: animationFrames.map((event, index) =>
        canonicalEvent(event, `animation-${index}`, boundsMinUs),
      ),
      interactions: data.UserInteractions.interactionEvents.map((event, index) =>
        canonicalEvent(event, `interaction-${index}`, boundsMinUs),
      ),
      layoutShifts: data.LayoutShifts.clusters.map((event, index) =>
        canonicalEvent(event, `layout-shift-${index}`, boundsMinUs),
      ),
      userTimings: [
        ...data.UserTimings.performanceMeasures,
        ...data.UserTimings.performanceMarks,
        ...data.UserTimings.consoleTimings,
        ...data.UserTimings.timestampEvents,
      ].map((event, index) =>
        canonicalEvent(event, `user-timing-${index}`, boundsMinUs),
      ),
      metrics: markers,
      navigations,
      requests,
      frames,
      memory,
      screenshots,
    },
  };
  options?.onMemoryStage?.("canonicalized");
  return result;
}

function canonicalEvent(
  event: EngineEvent,
  key: string,
  boundsMinUs: number,
): CanonicalEventRecord {
  const data: Record<string, unknown> = { ...event };
  delete data.ts;
  delete data.dur;
  return {
    key,
    name: event.name,
    category: event.cat,
    phase: event.ph ?? "",
    processId: event.pid,
    threadId: event.tid,
    startMs: (event.ts - boundsMinUs) / 1000,
    durationMs: (event.dur ?? 0) / 1000,
    data,
  };
}

async function collectAnimationFrames(
  traceEvents: EngineEvent[],
  config: ReturnType<typeof Trace.Types.Configuration.defaults>,
): Promise<readonly EngineEvent[]> {
  const handler = Trace.Handlers.ModelHandlers.AnimationFrames;
  handler.reset();
  handler.handleUserConfig(config);
  for (const event of traceEvents) {
    handler.handleEvent(
      event as Parameters<typeof handler.handleEvent>[0],
    );
  }
  await handler.finalize();
  return handler.data().animationFrames as unknown as readonly EngineEvent[];
}

/** Chrome marks parser/render blocking with several variants; anything not
 * explicitly non-blocking or absent counts as blocking. */
function isRenderBlocking(value: string | undefined): boolean {
  return value !== undefined && value !== "non_blocking";
}

function combinedFlag(values: (boolean | undefined)[]): boolean | undefined {
  if (values.some((value) => value === true)) return true;
  if (values.some((value) => value === false)) return false;
  return undefined;
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
