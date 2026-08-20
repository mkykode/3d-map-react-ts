import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTrace } from "./adapter";
import { modelTransferables } from "./transfer";

const FIXTURE = fileURLToPath(
  new URL("../../public/demo-trace.json", import.meta.url),
);

describe("worker model transfer", () => {
  it("transfers every per-entry column without copying", async () => {
    const raw = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
      traceEvents: unknown[];
    };
    const model = await parseTrace(raw.traceEvents);
    const expectedBuffers = model.lanes.flatMap((lane) =>
      Object.values(lane)
        .filter((value): value is ArrayBufferView => ArrayBuffer.isView(value))
        .map((value) => value.buffer as ArrayBuffer),
    );
    const callFrameSnapshots = model.lanes.map((lane) => [
      ...lane.callFrameIds,
    ]);
    const eventKeySnapshots = model.lanes.map((lane) => [...lane.eventKeyIds]);
    const parentSnapshots = model.lanes.map((lane) => [...lane.parentIndexes]);
    const exclusiveSnapshots = model.lanes.map((lane) => ({
      offsets: [...lane.exclusiveOffsets],
      starts: [...lane.exclusiveStarts],
      ends: [...lane.exclusiveEnds],
    }));

    const transferables = modelTransferables(model);
    expect(transferables).toHaveLength(expectedBuffers.length);
    for (const buffer of expectedBuffers) {
      expect(transferables.some((candidate) => candidate === buffer)).toBe(true);
    }
    expect(new Set(transferables).size).toBe(transferables.length);

    const cloned = structuredClone(model, { transfer: transferables });
    expect(cloned.defaultNavigationId).toBe(model.defaultNavigationId);
    expect(cloned.navigations).toEqual(model.navigations);
    expect(cloned.documentFrames).toEqual(model.documentFrames);
    expect(cloned.processes).toEqual(model.processes);
    for (const buffer of transferables) expect(buffer.byteLength).toBe(0);
    for (let i = 0; i < model.lanes.length; i++) {
      expect(cloned.lanes[i].callFrameIds.length).toBe(
        cloned.lanes[i].starts.length,
      );
      expect([...cloned.lanes[i].callFrameIds]).toEqual(callFrameSnapshots[i]);
      expect([...cloned.lanes[i].eventKeyIds]).toEqual(eventKeySnapshots[i]);
      expect([...cloned.lanes[i].parentIndexes]).toEqual(parentSnapshots[i]);
      expect([...cloned.lanes[i].exclusiveOffsets]).toEqual(
        exclusiveSnapshots[i].offsets,
      );
      expect([...cloned.lanes[i].exclusiveStarts]).toEqual(
        exclusiveSnapshots[i].starts,
      );
      expect([...cloned.lanes[i].exclusiveEnds]).toEqual(
        exclusiveSnapshots[i].ends,
      );
    }
  });
});
