/**
 * Shared data model produced by the engine adapter and consumed by every view.
 * All timestamps are milliseconds relative to the trace start (bounds.min µs).
 */

export type LaneKind = "main" | "thread" | "gpu" | "network";

export interface LaneMeta {
  id: number;
  name: string;
  kind: LaneKind;
  processUrl?: string;
  entryCount: number;
  maxDepth: number;
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
  /** Index into ParsedTraceModel.names. */
  nameIds: Uint32Array;
}

export interface VitalMarker {
  name: string;
  label: string;
  /** ms from trace start */
  ts: number;
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
}

export interface NetworkRequestInfo {
  start: number;
  end: number;
  url: string;
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
