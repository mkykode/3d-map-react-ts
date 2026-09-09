import { describe, expect, it } from "vitest";
import { MAX_RHYTHM_COLUMNS, rhythmDimensions } from "./rhythmLayout";

describe("rhythmDimensions", () => {
  it.each([0, 999, 1000, 256_000, 256_001, 70_000_000, Number.MAX_SAFE_INTEGER])("bounds columns and covers the full %i ms interval", (rangeMs) => {
    const grid = rhythmDimensions(rangeMs);
    expect(grid.seconds).toBeLessThanOrEqual(MAX_RHYTHM_COLUMNS);
    expect(grid.seconds * grid.secondsPerColumn * 1000).toBeGreaterThanOrEqual(rangeMs);
    expect(grid.cellsPerSecond * grid.cellMs).toBe(1000);
  });
  it("groups the first over-limit second into two-second columns", () => {
    expect(rhythmDimensions(256_001, 20)).toEqual({ seconds: 129, secondsPerColumn: 2, cellsPerSecond: 50, cellMs: 20 });
  });
  it.each([-1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])("rejects invalid range %s", (range) => {
    expect(() => rhythmDimensions(range)).toThrow(RangeError);
  });
  it.each([0, -10, 3, Infinity, NaN])("rejects invalid cell size %s", (cellMs) => {
    expect(() => rhythmDimensions(1000, cellMs)).toThrow(RangeError);
  });
});
