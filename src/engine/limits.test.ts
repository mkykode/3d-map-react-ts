import { describe, expect, test } from "vitest";
import {
  ENGINE_LIMITS,
  GIB,
  MIB,
  hasAggregateMemoryHeadroom,
  projectedInFlightPeakBytes,
  type IngestionMemoryCalibration,
} from "./limits";

const calibration: IngestionMemoryCalibration = {
  version: 1,
  measuredAt: "2026-08-19T00:00:00Z",
  fixture: "fixture",
  inputBufferMultiplier: 1,
  compressedBufferMultiplier: 1,
  utf8DecodeMultiplier: 1,
  jsStringMultiplier: 2,
  jsonParseRawEventsMultiplier: 3,
  traceEngineMultiplier: 4,
  canonicalizationOverlapMultiplier: 2,
  fixedBytes: MIB,
};

describe("engine limits", () => {
  test("freezes the documented byte and cardinality ceilings", () => {
    expect(ENGINE_LIMITS).toMatchObject({
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
    });
  });

  test("projects materialization amplification instead of payload bytes alone", () => {
    const peak = projectedInFlightPeakBytes(
      { importedBytes: 10 * MIB, decompressedBytes: 20 * MIB, compressed: true },
      calibration,
    );

    expect(peak).toBe(261 * MIB);
    expect(hasAggregateMemoryHeadroom(Math.floor(1.2 * GIB), peak)).toBe(true);
    expect(hasAggregateMemoryHeadroom(Math.floor(1.3 * GIB), peak)).toBe(false);
  });
});
