import type { ParsedTraceModel } from "./types";

/** All column buffers that cross the worker seam by ownership transfer. */
export function modelTransferables(model: ParsedTraceModel): ArrayBuffer[] {
  return [...model.lanes.flatMap((lane) => [
    lane.starts.buffer,
    lane.durs.buffer,
    lane.depths.buffer,
    lane.catIds.buffer,
    lane.selfTimes.buffer,
    lane.parentIndexes.buffer,
    lane.exclusiveOffsets.buffer,
    lane.exclusiveStarts.buffer,
    lane.exclusiveEnds.buffer,
    lane.nameIds.buffer,
    lane.entityIds.buffer,
    lane.callFrameIds.buffer,
    lane.eventKeyIds.buffer,
  ]), model.connections.edgeIds.buffer, model.connections.starts.buffer,
  model.connections.ends.buffer, model.connections.fromIdx.buffer,
  model.connections.toIdx.buffer] as ArrayBuffer[];
}
