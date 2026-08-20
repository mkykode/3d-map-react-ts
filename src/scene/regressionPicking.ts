import type { RegressionMark } from "../engine/findingContract";
import type { WorldBounds } from "./cameraActions";

export function regressionMarkAtInstance(
  marks: readonly RegressionMark[],
  instanceId: number | undefined,
): RegressionMark | null {
  if (
    instanceId === undefined ||
    !Number.isSafeInteger(instanceId) ||
    instanceId < 0 ||
    instanceId >= marks.length
  ) {
    return null;
  }
  return marks[instanceId];
}

export function regressionMarkBounds(mark: RegressionMark): WorldBounds {
  return {
    min: [
      mark.position[0] - mark.size[0] / 2,
      mark.position[1] - mark.size[1] / 2,
      mark.position[2] - mark.size[2] / 2,
    ],
    max: [
      mark.position[0] + mark.size[0] / 2,
      mark.position[1] + mark.size[1] / 2,
      mark.position[2] + mark.size[2] / 2,
    ],
  };
}

export function regressionProjectionBounds(
  marks: readonly RegressionMark[],
): WorldBounds {
  if (marks.length === 0) return { min: [0, 0, 0], max: [1, 1, 1] };
  const first = regressionMarkBounds(marks[0]);
  const min = [...first.min] as [number, number, number];
  const max = [...first.max] as [number, number, number];
  for (const mark of marks.slice(1)) {
    const bounds = regressionMarkBounds(mark);
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], bounds.min[axis]);
      max[axis] = Math.max(max[axis], bounds.max[axis]);
    }
  }
  return { min, max };
}
