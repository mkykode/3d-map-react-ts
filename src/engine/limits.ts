export const MIB = 1024 ** 2;
export const GIB = 1024 ** 3;

export const ENGINE_LIMITS = {
  minRunsPerCohort: 3,
  maxRunsPerCohort: 5,
  aggregateRetainedAndInFlightBytes: 1.5 * GIB,
  importedBytes: 256 * MIB,
  streamingDecompressedBytes: 768 * MIB,
  events: 5_000_000,
  resourceBytes: 32 * MIB,
  sourceMapBytes: 64 * MIB,
  sourceMapDepth: 8,
  retainedSourceBytesPerSession: 256 * MIB,
  projectionBytes: 64 * MIB,
  evidenceSliceBytes: 16 * MIB,
} as const;

export interface IngestionMemoryCalibration {
  version: 1;
  measuredAt: string;
  fixture: string;
  inputBufferMultiplier: number;
  compressedBufferMultiplier: number;
  utf8DecodeMultiplier: number;
  jsStringMultiplier: number;
  jsonParseRawEventsMultiplier: number;
  traceEngineMultiplier: number;
  canonicalizationOverlapMultiplier: number;
  fixedBytes: number;
}

export interface InFlightInput {
  importedBytes: number;
  decompressedBytes: number;
  compressed: boolean;
}

export function projectedInFlightPeakBytes(
  input: InFlightInput,
  calibration: IngestionMemoryCalibration,
): number {
  validateByteCount(input.importedBytes, "imported bytes");
  validateByteCount(input.decompressedBytes, "decompressed bytes");
  const factors = [
    calibration.inputBufferMultiplier,
    calibration.compressedBufferMultiplier,
    calibration.utf8DecodeMultiplier,
    calibration.jsStringMultiplier,
    calibration.jsonParseRawEventsMultiplier,
    calibration.traceEngineMultiplier,
    calibration.canonicalizationOverlapMultiplier,
  ];
  if (factors.some((factor) => !Number.isFinite(factor) || factor < 0)) {
    throw new Error("Memory calibration multipliers must be finite and non-negative");
  }
  validateByteCount(calibration.fixedBytes, "calibration fixed bytes");

  const inputBuffers = input.importedBytes * calibration.inputBufferMultiplier;
  const compressedBuffers = input.compressed
    ? input.importedBytes * calibration.compressedBufferMultiplier
    : 0;
  const materialization =
    input.decompressedBytes *
    (calibration.utf8DecodeMultiplier +
      calibration.jsStringMultiplier +
      calibration.jsonParseRawEventsMultiplier +
      calibration.traceEngineMultiplier +
      calibration.canonicalizationOverlapMultiplier);

  return Math.ceil(
    calibration.fixedBytes + inputBuffers + compressedBuffers + materialization,
  );
}

export function hasAggregateMemoryHeadroom(
  retainedCanonicalBytes: number,
  projectedInFlightBytes: number,
): boolean {
  validateByteCount(retainedCanonicalBytes, "retained canonical bytes");
  validateByteCount(projectedInFlightBytes, "projected in-flight bytes");
  return (
    retainedCanonicalBytes + projectedInFlightBytes <=
    ENGINE_LIMITS.aggregateRetainedAndInFlightBytes
  );
}

function validateByteCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}
