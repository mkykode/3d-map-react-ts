import { describe, expect, it } from "vitest";
import { sceneLane, sceneModel } from "../test/sceneFixtures";
import { buildConnections } from "../engine/connections";
import { systemLayout } from "./systemLayout";
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
});
