export const RHYTHM_CELL_MS = 10;
export const MAX_RHYTHM_COLUMNS = 256;
export const MS_PER_SECOND = 1000;

/** Shared temporal grid for aggregation, rendering, selection, and camera fit. */
export function rhythmDimensions(rangeMs: number, cellMs = RHYTHM_CELL_MS) {
  if (!Number.isFinite(rangeMs) || rangeMs < 0 || !Number.isSafeInteger(Math.ceil(rangeMs))) throw new RangeError("Rhythm range must be finite and non-negative");
  if (!Number.isFinite(cellMs) || cellMs < 1 || !Number.isInteger(MS_PER_SECOND / cellMs)) throw new RangeError("Rhythm cell size must divide one second exactly");
  const cellsPerSecond = Math.round(MS_PER_SECOND / cellMs);
  const totalSeconds = Math.max(1, Math.ceil(rangeMs / MS_PER_SECOND));
  const secondsPerColumn = Math.max(1, Math.ceil(totalSeconds / MAX_RHYTHM_COLUMNS));
  const seconds = Math.ceil(totalSeconds / secondsPerColumn);
  return { seconds, secondsPerColumn, cellsPerSecond, cellMs };
}
