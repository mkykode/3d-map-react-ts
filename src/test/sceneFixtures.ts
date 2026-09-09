import type { ColumnarLane, ParsedTraceModel } from "../engine/types";

export function sceneLane(events: { start: number; dur: number; depth?: number; self?: number; cat?: number; name?: number }[], id = 0): ColumnarLane {
  return {
    meta: { id, name: `Main ${id}`, kind: "main", entryCount: events.length, maxDepth: events.reduce((max, e) => Math.max(max, e.depth ?? 0), 0), maxDur: events.reduce((max, e) => Math.max(max, e.dur), 0) },
    starts: Float64Array.from(events.map((e) => e.start)),
    durs: Float64Array.from(events.map((e) => e.dur)),
    depths: Uint16Array.from(events.map((e) => e.depth ?? 0)),
    selfTimes: Float64Array.from(events.map((e) => e.self ?? e.dur)),
    catIds: Uint8Array.from(events.map((e) => e.cat ?? 2)),
    nameIds: Uint32Array.from(events.map((e) => e.name ?? 0)),
    parentIndexes: new Int32Array(events.length).fill(-1),
    exclusiveOffsets: Uint32Array.from({ length: events.length + 1 }, (_, i) => i),
    exclusiveStarts: Float64Array.from(events.map((e) => e.start)),
    exclusiveEnds: Float64Array.from(events.map((e) => e.start + (e.self ?? e.dur))),
    callFrameIds: new Uint32Array(events.length), eventKeyIds: new Uint32Array(events.length),
  };
}

export function sceneModel(lanes: ColumnarLane[], rangeMs = 1000): ParsedTraceModel {
  return { boundsMinUs: 0, rangeMs, lanes, names: Array.from({ length: 100 }, (_, i) => `activity ${i}`), functionNames: [], scriptUrls: [], callFrames: [], eventKeys: [], processes: [], documentFrames: [], navigations: [], mainFrameId: null, mainFrameUrl: null, defaultNavigationId: null, markers: [], screenshots: [], frames: [], requests: [], memory: [], flows: [], totalThreads: lanes.length, parseMs: 0 };
}
