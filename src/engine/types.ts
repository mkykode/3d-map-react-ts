/**
 * Shared data model produced by the engine adapter and consumed by every view.
 * All timestamps are milliseconds relative to the trace start (bounds.min µs).
 */

export type LaneKind = "main" | "thread" | "gpu" | "network";

export interface LaneMeta {
  id: number;
  name: string;
  kind: LaneKind;
  processId?: number;
  threadId?: number;
  entryCount: number;
  maxDepth: number;
  /** Longest event in the lane, ms; bounds the look-back for window culls. */
  maxDur: number;
}

export interface ColumnarLane {
  meta: LaneMeta;
  /** Event start, ms from trace start. Sorted ascending. */
  starts: Float64Array;
  /** Event duration, ms. */
  durs: Float64Array;
  /** Call-stack depth (0 = top level). */
  depths: Uint16Array;
  /** Index into CATEGORIES. */
  catIds: Uint8Array;
  /** Self time (duration minus children), ms. */
  selfTimes: Float64Array;
  /** Parent entry index in this lane; -1 means a root or non-hierarchical entry. */
  parentIndexes: Int32Array;
  /** CSR boundaries into exclusiveStarts/exclusiveEnds for each entry. */
  exclusiveOffsets: Uint32Array;
  /** Exact spans where the entry runs without a child, ms from trace start. */
  exclusiveStarts: Float64Array;
  exclusiveEnds: Float64Array;
  /** Index into ParsedTraceModel.names. */
  nameIds: Uint32Array;
  /** One-based index into ParsedTraceModel.callFrames; 0 means no call frame. */
  callFrameIds: Uint32Array;
  /** One-based index into ParsedTraceModel.eventKeys; 0 means unserializable. */
  eventKeyIds: Uint32Array;
}

export interface CallFrameInfo {
  /** Index into ParsedTraceModel.functionNames. */
  functionNameId: number;
  /** Index into ParsedTraceModel.scriptUrls. */
  urlId: number;
  scriptId: string;
  /** Zero-based source coordinates from the Chrome protocol. */
  lineNumber: number;
  columnNumber: number;
}

export interface VitalMarker {
  name: string;
  label: string;
  /** ms from trace start */
  ts: number;
  navigationId?: string;
  frameId?: string;
  processId?: number;
  threadId?: number;
  eventKey?: string | null;
}

export interface ProcessInfo {
  id: number;
  name?: string;
  url?: string;
  isOnMainFrame: boolean;
  isBrowser: boolean;
  isGpu: boolean;
}

export interface FrameProcessWindow {
  processId: number;
  url: string;
  start: number;
  end: number;
}

export interface DocumentFrameInfo {
  id: string;
  parentId?: string;
  name: string;
  isOutermostMainFrame?: boolean;
  isInPrimaryMainFrame?: boolean;
  processWindows: FrameProcessWindow[];
}

export interface NavigationInfo {
  kind: "hard" | "soft";
  id: string;
  frameId: string;
  processId: number;
  /** Thread that emitted the navigation marker, not necessarily a render thread. */
  emittingThreadId: number;
  start: number;
  end: number;
  url: string;
  isOutermostMainFrame?: boolean;
  isLoadingMainFrame?: boolean;
}

export interface ScreenshotMeta {
  /** ms from trace start */
  ts: number;
  dataUri: string;
}

export interface FrameInfo {
  start: number;
  end: number;
  dropped: boolean;
  eventKey?: string | null;
}

export interface NetworkRequestInfo {
  start: number;
  end: number;
  url: string;
  method?: string | null;
  eventKey?: string | null;
  /** True when the request blocks rendering (parser/render blocking). */
  renderBlocking: boolean;
}

export interface MemorySample {
  ts: number;
  jsHeapUsed: number;
}

/** One causality flow: an ordered chain of (lane, entry index) points. */
export interface FlowChain {
  points: { lane: number; idx: number }[];
}

export interface ParsedTraceModel {
  /** Raw trace bounds in µs (for cross-trace alignment). */
  boundsMinUs: number;
  /** Total range in ms. */
  rangeMs: number;
  lanes: ColumnarLane[];
  /** Shared string table for nameIds. */
  names: string[];
  /** Dedicated interned strings referenced by callFrames. */
  functionNames: string[];
  scriptUrls: string[];
  callFrames: CallFrameInfo[];
  /** trace_engine serializable keys used for stable entry references. */
  eventKeys: string[];
  processes: ProcessInfo[];
  documentFrames: DocumentFrameInfo[];
  navigations: NavigationInfo[];
  mainFrameId: string | null;
  mainFrameUrl: string | null;
  /** Initial navigation selection; mutable ownership lives in the app store. */
  defaultNavigationId: string | null;
  markers: VitalMarker[];
  screenshots: ScreenshotMeta[];
  frames: FrameInfo[];
  requests: NetworkRequestInfo[];
  memory: MemorySample[];
  flows: FlowChain[];
  /** Threads seen vs lanes kept, so caps are never silent. */
  totalThreads: number;
  parseMs: number;
}

export interface BucketedLane {
  laneId: number;
  /** Busy self-time ms per bucket. */
  busy: Float32Array;
  /** Dominant category id per bucket. */
  dominantCat: Uint8Array;
}

export interface BucketGrid {
  bucketMs: number;
  bucketCount: number;
  t0: number;
  t1: number;
  lanes: BucketedLane[];
}

export interface BottomUpRow {
  nameId: number;
  catId: number;
  self: number;
  total: number;
  count: number;
}

export interface RhythmGrid {
  /** seconds x cellsPerSecond, row-major; busy ms per cell */
  cells: Float32Array;
  seconds: number;
  cellsPerSecond: number;
  cellMs: number;
  maxBusy: number;
}

export interface DiffLane {
  name: string;
  /** delta busy ms per bucket (B - A); positive = regression. */
  delta: Float32Array;
}

export interface DiffGrid {
  bucketMs: number;
  bucketCount: number;
  lanes: DiffLane[];
  maxAbsDelta: number;
}
