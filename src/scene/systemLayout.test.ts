import { describe, expect, it } from "vitest";
import { sceneLane, sceneModel } from "../test/sceneFixtures";
import { buildConnections } from "../engine/connections";
import { systemLayout, systemSelectionBounds } from "./systemLayout";
import { CAT_ID } from "../engine/categories";

describe("System layout", () => {
  it("colors a thread by its largest category share, including after window changes", () => {
    const model = sceneModel([sceneLane([
      { start: 0, dur: 30, cat: CAT_ID.system, name: 0 },
      { start: 30, dur: 20, cat: CAT_ID.scripting, name: 1 },
      { start: 50, dur: 20, cat: CAT_ID.scripting, name: 2 },
    ])], 100);
    expect(systemLayout(model, new Set(), 0, 100).buildings[0]).toMatchObject({ busy: 70, catId: CAT_ID.scripting });
    expect(systemLayout(model, new Set(), 0, 30).buildings[0]).toMatchObject({ busy: 30, catId: CAT_ID.system });
    expect(systemLayout(model, new Set(), 80, 100).buildings[0]).toMatchObject({ busy: 0, catId: CAT_ID.system });
  });

  it("clips busy time to the brush and removes hidden buildings and arcs (AC-1.1, AC-1.3)", () => {
    const model = sceneModel([sceneLane([{ start: 0, dur: 80 }]), sceneLane([{ start: 20, dur: 10 }], 1)], 100);
    model.connections = buildConnections([{ from: { lane: 0, idx: 0, start: 0 }, to: { lane: 1, idx: 0, start: 20 }, kind: "flow", provenance: "recorded" }]);
    const full = systemLayout(model, new Set(), 0, 100);
    const clipped = systemLayout(model, new Set(), 50, 100);
    expect(full.buildings.map((b) => b.busy)).toEqual([80, 10]);
    expect(clipped.buildings.map((b) => b.busy)).toEqual([30, 0]);
    expect([...clipped.links.counts]).toEqual([0]);
    const hidden = systemLayout(model, new Set([1]), 0, 100);
    expect(hidden.buildings.map((b) => b.lane)).toEqual([0]);
    expect([...hidden.links.counts]).toEqual([0]);
    expect(systemLayout(model, new Set(), 0, 100)).toEqual(full);
  });

  it("keeps positions and work units stable across windows and hidden tracks", () => {
    const model = sceneModel([sceneLane([{ start: 0, dur: 80 }]), sceneLane([{ start: 20, dur: 10 }], 1)], 100);
    const full = systemLayout(model, new Set(), 0, 100);
    const clipped = systemLayout(model, new Set(), 50, 100);
    const hidden = systemLayout(model, new Set([1]), 0, 100);
    const height = (building: typeof full.buildings[number]) => building.bounds.max[1] - building.bounds.min[1];
    expect(height(clipped.buildings[0]) / height(full.buildings[0])).toBeCloseTo(30 / 80);
    expect(height(clipped.buildings[1])).toBe(0);
    expect(hidden.buildings[0].bounds).toEqual(full.buildings[0].bounds);
    expect(clipped.buildings[0].anchor[0]).toBe(full.buildings[0].anchor[0]);
    expect(clipped.buildings[0].anchor[2]).toBe(full.buildings[0].anchor[2]);
  });

  it("places requests within their owner's region and preserves positions when earlier requests leave the window", () => {
    const main = sceneLane([{ start: 0, dur: 10 }]);
    const embedded = sceneLane([{ start: 60, dur: 10 }], 1);
    main.meta.processId = 10; embedded.meta.processId = 20;
    const network = sceneLane([], 2); network.meta.kind = "network";
    const model = sceneModel([main, embedded, network], 100);
    model.requests = [
      { start: 0, end: 20, url: "https://other-host.test/a", requesterLane: 0, renderBlocking: false, initiatorType: null },
      { start: 60, end: 90, url: "https://page.test/b", requesterLane: 1, renderBlocking: false, initiatorType: null },
      { start: 70, end: 80, url: "https://page.test/c", requesterLane: null, renderBlocking: false, initiatorType: null },
    ];
    const full = systemLayout(model, new Set(), 0, 100);
    const inside = (request: typeof full.requests[number], plate: typeof full.plates[number]) => request.bounds.min[0] >= plate.bounds.min[0] && request.bounds.max[0] <= plate.bounds.max[0] && request.bounds.min[2] >= plate.bounds.min[2] && request.bounds.max[2] <= plate.bounds.max[2];
    expect(inside(full.requests[0], full.plates.find((plate) => plate.lanes.includes(0))!)).toBe(true);
    expect(inside(full.requests[1], full.plates.find((plate) => plate.lanes.includes(1))!)).toBe(true);
    const unknown = full.plates.find((plate) => plate.id === "unknown");
    expect(unknown).toBeDefined();
    expect(inside(full.requests[2], unknown!)).toBe(true);
    expect(systemLayout(model, new Set(), 50, 100).requests[0].bounds).toEqual(full.requests[1].bounds);
    expect(systemLayout(model, new Set([1]), 0, 100).requests[1].bounds).toEqual(full.requests[1].bounds);
    expect(systemLayout(model, new Set([2]), 0, 100).requests).toEqual([]);
    const fit = systemSelectionBounds(model, full, { kind: "entry", lane: 2, idx: 1 })!;
    expect(inside(full.requests[1], { ...full.plates[0], bounds: fit })).toBe(true);
    expect(systemSelectionBounds(model, systemLayout(model, new Set([1]), 0, 100), { kind: "entry", lane: 1, idx: 1 })).toBeNull();
    model.connections = buildConnections([{ from: { lane: 2, idx: 0, start: 0 }, to: { lane: 1, idx: 0, start: 60 }, kind: "consumer", provenance: "derived" }]);
    const later = systemLayout(model, new Set(), 50, 100);
    expect(later.requests.some((request) => request.index === 0)).toBe(true);
    expect(later.plates.find((plate) => plate.lanes.includes(0))?.earlierCount).toBe(1);
  });
});
