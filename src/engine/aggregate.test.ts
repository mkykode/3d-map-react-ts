import { describe, expect, it } from "vitest";
import { bottomUp, bucketize, diffTraces, rhythmFold } from "./aggregate";
import { CAT_ID } from "./categories";
import type { ColumnarLane, ParsedTraceModel } from "./types";

function lane(
  events: {
    start: number;
    dur: number;
    self?: number;
    depth?: number;
    cat?: number;
    nameId?: number;
  }[],
  id = 0,
  name = "Main — test",
): ColumnarLane {
  return {
    meta: {
      id,
      name,
      kind: "main",
      entryCount: events.length,
      maxDepth: Math.max(0, ...events.map((e) => e.depth ?? 0)),
    },
    starts: Float64Array.from(events.map((e) => e.start)),
    durs: Float64Array.from(events.map((e) => e.dur)),
    depths: Uint16Array.from(events.map((e) => e.depth ?? 0)),
    catIds: Uint8Array.from(events.map((e) => e.cat ?? CAT_ID.scripting)),
    selfTimes: Float64Array.from(events.map((e) => e.self ?? e.dur)),
    nameIds: Uint32Array.from(events.map((e) => e.nameId ?? 0)),
  };
}

function model(
  lanes: ColumnarLane[],
  rangeMs: number,
  navStart = 0,
): ParsedTraceModel {
  return {
    boundsMinUs: 0,
    rangeMs,
    lanes,
    names: ["a", "b", "c"],
    markers: [{ name: "navigationStart", label: "Nav", ts: navStart }],
    screenshots: [],
    frames: [],
    requests: [],
    memory: [],
    flows: [],
    totalThreads: lanes.length,
    parseMs: 0,
  };
}

describe("bucketize", () => {
  it("attributes self time to the right buckets", () => {
    // 100ms window, 10 buckets. One 10ms event fully inside bucket 2.
    const grid = bucketize([lane([{ start: 25, dur: 10 }])], 0, 100, 10);
    expect(grid.lanes[0].busy[2]).toBeCloseTo(5, 5); // 25-30
    expect(grid.lanes[0].busy[3]).toBeCloseTo(5, 5); // 30-35
    const total = grid.lanes[0].busy.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(10, 5);
  });

  it("splits spanning events proportionally and clips to the window", () => {
    const grid = bucketize([lane([{ start: -50, dur: 100, self: 100 }])], 0, 100, 10);
    // Half the span is inside the window: 50ms of self time, 10 per bucket 0-4.
    const busy = grid.lanes[0].busy;
    for (let b = 0; b < 5; b++) expect(busy[b]).toBeCloseTo(10, 4);
    for (let b = 5; b < 10; b++) expect(busy[b]).toBeCloseTo(0, 4);
  });

  it("picks the dominant category per bucket", () => {
    const grid = bucketize(
      [
        lane([
          { start: 0, dur: 8, cat: CAT_ID.scripting },
          { start: 0, dur: 2, cat: CAT_ID.painting },
        ]),
      ],
      0,
      10,
      1,
    );
    expect(grid.lanes[0].dominantCat[0]).toBe(CAT_ID.scripting);
  });
});

describe("bottomUp", () => {
  it("aggregates self, total and count per name within the window", () => {
    const rows = bottomUp(
      [
        lane([
          { start: 0, dur: 10, self: 4, nameId: 0 },
          { start: 20, dur: 10, self: 6, nameId: 0 },
          { start: 40, dur: 2, self: 2, nameId: 1 },
          { start: 900, dur: 5, self: 5, nameId: 2 }, // outside window
        ]),
      ],
      0,
      100,
    );
    expect(rows[0]).toMatchObject({ nameId: 0, self: 10, total: 20, count: 2 });
    expect(rows[1]).toMatchObject({ nameId: 1, self: 2, count: 1 });
    expect(rows.find((r) => r.nameId === 2)).toBeUndefined();
  });

  it("clips events cut by the window to their overlapping share", () => {
    // 200ms event with 100ms self; only half of it lies inside [0, 100].
    const rows = bottomUp(
      [lane([{ start: -100, dur: 200, self: 100, nameId: 0 }])],
      0,
      100,
    );
    expect(rows[0].self).toBeCloseTo(50, 5);
    expect(rows[0].total).toBeCloseTo(100, 5);
    expect(rows[0].count).toBe(1);

    // A 1ms window inside a long task reports ~1ms, not the whole task.
    const narrow = bottomUp(
      [lane([{ start: 0, dur: 1000, self: 1000, nameId: 0 }])],
      500,
      501,
    );
    expect(narrow[0].self).toBeCloseTo(1, 5);
    expect(narrow[0].total).toBeCloseTo(1, 5);
  });
});

describe("rhythmFold", () => {
  it("aligns periodic work into the same subsecond cells", () => {
    // 20ms of work at +100ms into each of 3 seconds.
    const grid = rhythmFold(
      lane([
        { start: 100, dur: 20 },
        { start: 1100, dur: 20 },
        { start: 2100, dur: 20 },
      ]),
      3000,
      10,
    );
    expect(grid.seconds).toBe(3);
    expect(grid.cellsPerSecond).toBe(100);
    for (let s = 0; s < 3; s++) {
      expect(grid.cells[s * 100 + 10]).toBeCloseTo(10, 4);
      expect(grid.cells[s * 100 + 11]).toBeCloseTo(10, 4);
      expect(grid.cells[s * 100 + 50]).toBeCloseTo(0, 4);
    }
    expect(grid.maxBusy).toBeCloseTo(10, 4);
  });
});

describe("diffTraces", () => {
  it("aligns at navigationStart and reports signed deltas", () => {
    // A: 10ms of work at nav+5. B: 30ms of work at nav+5 (nav shifted +100).
    const a = model([lane([{ start: 5, dur: 10 }])], 200, 0);
    const b = model([lane([{ start: 105, dur: 30 }])], 300, 100);
    const grid = diffTraces(a, b, 20);
    const sum = grid.lanes[0].delta.reduce((acc, v) => acc + v, 0);
    expect(grid.lanes.length).toBe(1);
    expect(grid.lanes[0].name).toBe("Main");
    expect(sum).toBeCloseTo(20, 3); // B - A = 30 - 10
    expect(grid.maxAbsDelta).toBeGreaterThan(0);
  });
});
