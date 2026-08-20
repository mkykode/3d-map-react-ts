export type CollectionCheckpoint = (
  completed: number,
  total: number,
) => Promise<void>;

const COLLECTION_CHUNK_SIZE = 128;

export function visitItems<T>(
  items: readonly T[],
  visit: (item: T, index: number) => void,
): void {
  items.forEach(visit);
}

export async function visitItemsInterruptibly<T>(
  items: readonly T[],
  visit: (item: T, index: number) => void,
  checkpoint: CollectionCheckpoint,
): Promise<void> {
  if (items.length === 0) {
    await checkpoint(0, 0);
    return;
  }
  for (const [index, item] of items.entries()) {
    visit(item, index);
    const completed = index + 1;
    if (completed === items.length || completed % COLLECTION_CHUNK_SIZE === 0) {
      await checkpoint(completed, items.length);
    }
  }
}

export function overlaps(
  startMs: number,
  durationMs: number,
  bounds: readonly [number, number],
): boolean {
  return startMs < bounds[1] && startMs + Math.max(0, durationMs) > bounds[0];
}

export function overlapDuration(
  startMs: number,
  endMs: number,
  bounds: readonly [number, number],
): number {
  return Math.max(0, Math.min(endMs, bounds[1]) - Math.max(startMs, bounds[0]));
}
