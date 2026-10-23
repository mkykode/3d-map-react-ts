import { describe, expect, it } from "vitest";
import { buildConnections } from "../engine/connections";
import { sceneLane, sceneModel } from "../test/sceneFixtures";
import { systemLayout } from "./systemLayout";
import { systemConnections } from "./systemConnections";

describe("System participant routes", () => {
  it("routes each request to its own tile and keeps local flows local", () => {
    const main = sceneLane([{ start: 0, dur: 10 }]);
    const network = sceneLane([{ start: 5, dur: 20 }, { start: 6, dur: 20 }], 1);
    network.meta.kind = "network";
    const model = sceneModel([main, network], 100);
    model.requests = [5, 6].map((start) => ({ start, end: start + 20, url: "https://other.test", requesterLane: 0, renderBlocking: false, initiatorType: "script" }));
    model.connections = buildConnections([
      ...[0, 1].map((idx) => ({ from: { lane: 0, idx: 0, start: 0 }, to: { lane: 1, idx, start: 5 + idx }, kind: "request" as const, provenance: "recorded" as const })),
      { from: { lane: 0, idx: 0, start: 0 }, to: { lane: 0, idx: 0, start: 1 }, kind: "flow", provenance: "recorded" },
    ]);
    const layout = systemLayout(model, new Set(), 0, 100);
    expect(systemConnections(model, layout, null).arcs.filter((arc) => arc.request !== undefined)).toHaveLength(0);
    const routes = systemConnections(model, layout, { kind: "connection", edge: 0 });
    const resourceRoutes = routes.arcs.filter((arc) => arc.request !== undefined);
    expect(resourceRoutes).toHaveLength(2);
    expect(resourceRoutes[0].to).toEqual(layout.requests[0].anchor);
    expect(resourceRoutes[1].to).toEqual(layout.requests[1].anchor);
    expect(routes.localCounts.get(0)).toBe(1);
    expect(routes.arcs.find((arc) => arc.request === undefined)?.loopRadius).toBeLessThanOrEqual(4);
    const expanded = systemConnections(model, layout, { kind: "lane", lane: 0 });
    expect(expanded.arcs.find((arc) => arc.request === undefined)?.loopRadius).toBe(7);
    expect(systemConnections(model, systemLayout(model, new Set([1]), 0, 100), null).arcs).toHaveLength(1);
  });
});
