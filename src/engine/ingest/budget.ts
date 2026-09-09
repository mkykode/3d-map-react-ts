const MIB = 1024 ** 2;

/** Stream limits bound work and single-value memory, not whole-file buffering. */
export const STREAM_LIMITS = Object.freeze({
  inputBytes: 8 * 1024 ** 3,
  decompressedBytes: 16 * 1024 ** 3,
  valueBytes: 16 * MIB,
  nesting: 128,
  events: 50_000_000,
  histogramBins: 2048,
  retainedBytes: 80 * MIB,
  retainedEvents: 400_000,
  streamOverheadBytes: 64 * MIB,
  // Existing calibration: raw objects 4.5 + engine 7.5 + canonical overlap 3.
  // Streaming removes the input buffers and whole-document decode multipliers.
  retainedMultiplier: 15,
  eventOverheadBytes: 2048,
  largeFileBytes: 32 * MIB,
});

export function streamingPeakBytes(bytes: number, events: number): number {
  return STREAM_LIMITS.streamOverheadBytes + Math.max(
    bytes * STREAM_LIMITS.retainedMultiplier,
    events * STREAM_LIMITS.eventOverheadBytes,
  );
}

export function fitsFullRecording(bytes: number, events: number): boolean {
  return bytes <= STREAM_LIMITS.retainedBytes && events <= STREAM_LIMITS.retainedEvents;
}

export const WINDOW_REQUIRED = "This interval exceeds the retained-data budget. Choose a shorter time window.";
