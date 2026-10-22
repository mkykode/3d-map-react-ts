import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { parseTrace } from "./adapter";
import type { ParsedTraceModel } from "./types";
import { buildConnections, connectionsInWindow, consumerConnections, type ConnectionInput } from "./connections";
import { playbackIndex, playbackPackets } from "./moments";

let model: ParsedTraceModel;
beforeAll(async () => {
  const raw = JSON.parse(readFileSync(new URL("../../public/demo-trace.json", import.meta.url), "utf8"));
  model = await parseTrace(raw.traceEvents);
});

describe("demo connection evidence", () => {
  it("matches consumers to the latest earlier request, allowing several consumers per request", () => {
    const request = (idx: number, start: number) => ({ url: "https://example.test/app.js", lane: 1, idx, start });
    const consumer = (idx: number, start: number) => ({ ...request(idx, start), lane: 0 });
    const matches = consumerConnections([request(1, 20), request(0, 0)], [consumer(0, 10), consumer(1, 20), consumer(2, 25), consumer(3, 30), { ...consumer(4, 40), url: "https://other.test/" }]);
    expect(matches.map((link) => [link.from.idx, link.to.idx])).toEqual([[0, 0], [0, 1], [1, 2], [1, 3]]);
    expect(matches.every((link) => link.provenance === "derived")).toBe(true);
  });
  it("keeps the recorded Main to ThreadPool links without duplicate initiators (AC-1.2)", () => {
    const from = model.lanes.find((lane) => lane.meta.kind === "main" && lane.meta.name.includes("monkeykode.com"))!;
    const to = model.lanes.find((lane) => lane.meta.threadId === 15363)!;
    const graph = model.connections;
    expect(graph).toBeDefined();
    const edge = graph.edges.findIndex((edge) => edge.fromLane === from.meta.id && edge.toLane === to.meta.id && edge.provenance === "recorded");
    expect([...graph.edgeIds].filter((id) => id === edge)).toHaveLength(23);
    const derived = graph.edges.findIndex((edge) => model.lanes[edge.fromLane].meta.name === "Main — vercel.live" && edge.toLane === from.meta.id && edge.provenance === "derived");
    expect([...graph.edgeIds].filter((id) => id === derived)).toHaveLength(5);
  });

  it("preserves valid endpoints, time order, and recorded request ownership (AC-0.2)", () => {
    const graph = model.connections;
    expect(model.requests.filter((request) => request.initiatorType)).toHaveLength(42);
    expect(graph.edges.some((edge) => edge.fromLane === edge.toLane)).toBe(true);
    for (let i = 0; i < graph.edgeIds.length; i++) {
      const edge = graph.edges[graph.edgeIds[i]];
      for (const [lane, index] of [[edge.fromLane, graph.fromIdx[i]], [edge.toLane, graph.toIdx[i]]]) {
        expect(index).toBeGreaterThanOrEqual(-1);
        expect(index).toBeLessThan(model.lanes[lane].starts.length);
      }
      if (i) expect(graph.starts[i]).toBeGreaterThanOrEqual(graph.starts[i - 1]);
    }
    expect(model.requests.filter((r) => r.start <= 34.24 && r.end > 34.24)).toHaveLength(19);
    const frame = playbackPackets(playbackIndex(model), 34.24, new Set(graph.edges.map((_, id) => id)), new Set(model.lanes.map((lane) => lane.meta.id)));
    expect(frame.packets.filter((packet) => packet.kind === "request")).toHaveLength(19);
  });

  it("does not count a flow twice and reports unplaced links", () => {
    const link: ConnectionInput = { from: { lane: 0, idx: 2, start: 10 }, to: { lane: 1, idx: 3, start: 20 }, kind: "flow", provenance: "recorded" };
    const graph = buildConnections([link, link, { ...link, kind: "initiator", provenance: "derived" }, { ...link, to: { lane: null, idx: -1, start: 30 } }]);
    expect(graph.edgeIds).toHaveLength(1);
    expect(graph.edges[0].provenance).toBe("recorded");
    expect(graph.unplaced).toBe(1);
    expect([...connectionsInWindow(graph, 15, 18, new Set()).counts]).toEqual([1]);
    expect([...connectionsInWindow(graph, 30, 40, new Set()).counts]).toEqual([0]);
    expect([...connectionsInWindow(graph, 0, 40, new Set([1])).counts]).toEqual([0]);
  });
});
