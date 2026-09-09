export interface TraceEvent extends Record<string, unknown> {
  name: string;
  ph: string;
  ts: number;
  pid: number;
  tid: number;
  dur?: number;
  cat?: string;
  args?: Record<string, unknown>;
}

/** Absolute trace timestamps, in microseconds; the end is exclusive. */
export type TraceWindow = readonly [startUs: number, endUs: number];

export interface TraceOverview {
  startUs: number;
  endUs: number;
  bucketStartUs: number;
  bucketWidthUs: number;
  counts: number[];
  eventCount: number;
  retainedEventCount: number;
  retainedBytes: number;
  decompressedBytes: number;
}

export interface TraceReduction {
  version: 1;
  mode: "visualization";
  sourceEventCount: number;
  retainedEventCount: number;
  droppedBookkeeping: number;
  droppedSourceEvents: number;
  outsideWindow: number;
  omittedEnvelopeFields: string[];
  window: TraceWindow | null;
  importSha256: string;
  payloadSha256: string;
}

export interface StreamOptions {
  hashes?: boolean;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
  checkCanceled?: () => void;
}

export interface PreparedTrace {
  traceEvents: TraceEvent[];
  metadata: Record<string, unknown>;
  settings: Record<string, unknown>;
  report: TraceReduction;
  retainedBytes: number;
}
