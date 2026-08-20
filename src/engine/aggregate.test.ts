import { describe, expect, it } from "vitest";
import {
  bottomUp,
  bucketize,
  computeStalls,
  diffTraces,
  rhythmFold,
  windowSlice,
} from "./aggregate";
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
    exclusive?: [start: number, end: number][];
  }[],
  id = 0,
  name = "Main — test",
): ColumnarLane {
  const exclusiveStarts: number[] = [];
  const exclusiveEnds: number[] = [];
  const exclusiveOffsets = [0];
  for (const event of events) {
    const self = event.self ?? event.dur;
    const intervals = event.exclusive ??
      (self > 0 ? [[event.start, event.start + self] as const] : []);
    for (const [start, end] of intervals) {
      exclusiveStarts.push(start);
      exclusiveEnds.push(end);
    }
    exclusiveOffsets.push(exclusiveStarts.length);
  }
  return {
    meta: {
      id,
      name,
      kind: "main",
      entryCount: events.length,
      maxDepth: Math.max(0, ...events.map((e) => e.depth ?? 0)),
      maxDur: Math.max(0, ...events.map((e) => e.dur)),
    },
    starts: Float64Array.from(events.map((e) => e.start)),
    durs: Float64Array.from(events.map((e) => e.dur)),
    depths: Uint16Array.from(events.map((e) => e.depth ?? 0)),
    catIds: Uint8Array.from(events.map((e) => e.cat ?? CAT_ID.scripting)),
    selfTimes: Float64Array.from(events.map((e) => e.self ?? e.dur)),
    parentIndexes: new Int32Array(events.length).fill(-1),
    exclusiveOffsets: Uint32Array.from(exclusiveOffsets),
    exclusiveStarts: Float64Array.from(exclusiveStarts),
    exclusiveEnds: Float64Array.from(exclusiveEnds),
    nameIds: Uint32Array.from(events.map((e) => e.nameId ?? 0)),
    callFrameIds: new Uint32Array(events.length),
    eventKeyIds: new Uint32Array(events.length),
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
    functionNames: [],
    scriptUrls: [],
    callFrames: [],
    eventKeys: [],
    processes: [],
    documentFrames: [],
    navigations: [],
    mainFrameId: null,
    mainFrameUrl: null,
    defaultNavigationId: null,
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

  it("does not spread parent self time into child-occupied buckets", () => {
    const grid = bucketize(
      [
        lane([
          {
            start: 0,
            dur: 100,
            self: 80,
            exclusive: [
              [0, 40],
              [60, 100],
            ],
          },
          { start: 40, dur: 20, depth: 1 },
        ]),
      ],
      0,
      100,
      5,
    );

    expect([...grid.lanes[0].busy]).toEqual([20, 20, 20, 20, 20]);
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

  it("clips exact exclusive intervals at the window edge", () => {
    // The event's self work runs from -50 to 50, half inside [0, 100].
    const rows = bottomUp(
      [
        lane([
          {
            start: -100,
            dur: 200,
            self: 100,
            nameId: 0,
            exclusive: [[-50, 50]],
          },
        ]),
      ],
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

  it("attributes self time only where an event runs without its children", () => {
    const nested = Object.assign(
      lane([
        { start: 0, dur: 100, self: 80, nameId: 0 },
        { start: 40, dur: 20, self: 20, nameId: 1, depth: 1 },
      ]),
      {
        parentIndexes: Int32Array.from([-1, 0]),
        exclusiveOffsets: Uint32Array.from([0, 2, 3]),
        exclusiveStarts: Float64Array.from([0, 60, 40]),
        exclusiveEnds: Float64Array.from([40, 100, 60]),
      },
    );

    const rows = bottomUp([nested], 40, 60);
    expect(rows.find((row) => row.nameId === 0)).toMatchObject({
      self: 0,
      total: 20,
    });
    expect(rows.find((row) => row.nameId === 1)).toMatchObject({
      self: 20,
      total: 20,
    });
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

  it("folds exact exclusive work instead of inclusive-span density", () => {
    const grid = rhythmFold(
      lane([
        {
          start: 0,
          dur: 100,
          self: 80,
          exclusive: [
            [0, 40],
            [60, 100],
          ],
        },
        { start: 40, dur: 20, depth: 1 },
      ]),
      100,
      20,
    );

    expect([...grid.cells.slice(0, 5)]).toEqual([20, 20, 20, 20, 20]);
  });
});

describe("windowSlice", () => {
  it("returns the index range overlapping the window, honoring maxDur", () => {
    const l = lane([
      { start: 0, dur: 500 }, // long parent overlapping the window
      { start: 100, dur: 10 },
      { start: 300, dur: 10 },
      { start: 700, dur: 10 }, // beyond the window
    ]);
    const { lo, hi } = windowSlice(l, 250, 600);
    expect(lo).toBe(0); // long event must stay in range
    expect(hi).toBe(3); // event at 700 excluded
    const inWindow = [];
    for (let i = lo; i < hi; i++) {
      if (l.starts[i] + l.durs[i] >= 250 && l.starts[i] <= 600) inWindow.push(i);
    }
    expect(inWindow).toEqual([0, 2]);
  });
});

describe("computeStalls", () => {
  const req = (start: number, end: number, renderBlocking = true) => ({
    start,
    end,
    url: "https://x/y.css",
    renderBlocking,
  });

  it("finds idle-while-blocked bands and skips busy or unblocked time", () => {
    // Main busy 0-100, idle 100-300, busy 300-400. Blocking request 80-260.
    const main = lane([
      { start: 0, dur: 100 },
      { start: 300, dur: 100 },
    ]);
    const bands = computeStalls(main, [req(80, 260)], 0, 400);
    expect(bands.length).toBe(1);
    expect(bands[0].start).toBeGreaterThanOrEqual(96);
    expect(bands[0].start).toBeLessThanOrEqual(120);
    expect(bands[0].end).toBeLessThanOrEqual(264);
  });

  it("ignores non-blocking requests and missing main lane", () => {
    const main = lane([{ start: 0, dur: 10 }]);
    expect(computeStalls(main, [req(0, 300, false)], 0, 400)).toEqual([]);
    expect(computeStalls(undefined, [req(0, 300)], 0, 400)).toEqual([]);
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
