import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseTrace } from "./adapter";
import { CATEGORIES } from "./categories";
import type { ParsedTraceModel } from "./types";

const FIXTURE = fileURLToPath(
  new URL("../../public/demo-trace.json", import.meta.url),
);
const PARSE_BUDGET_MS = 15_000;

let cached: ParsedTraceModel | null = null;
async function fixtureModel(): Promise<ParsedTraceModel> {
  if (!cached) {
    const raw = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
      traceEvents: unknown[];
    };
    cached = await parseTrace(raw.traceEvents);
  }
  return cached;
}

describe("adapter (trace_engine) on the demo fixture", () => {
  it("parses within the perf budget", async () => {
    const started = performance.now();
    const model = await fixtureModel();
    expect(model.parseMs).toBeLessThan(PARSE_BUDGET_MS);
    expect(performance.now() - started).toBeLessThan(PARSE_BUDGET_MS);
  });

  it("extracts lanes with a primary main thread", async () => {
    const model = await fixtureModel();
    expect(model.lanes.length).toBeGreaterThan(3);
    const main = model.lanes.find((l) => l.meta.kind === "main");
    expect(main).toBeDefined();
    expect(main!.meta.name).toContain("monkeykode.com");
    expect(main!.meta.entryCount).toBeGreaterThan(3000);
    expect(model.totalThreads).toBeGreaterThanOrEqual(model.lanes.length);
  });

  it("produces sorted, finite, categorized columns", async () => {
    const model = await fixtureModel();
    for (const lane of model.lanes) {
      let prev = -Infinity;
      for (let i = 0; i < lane.starts.length; i++) {
        expect(Number.isFinite(lane.starts[i])).toBe(true);
        expect(lane.starts[i]).toBeGreaterThanOrEqual(prev);
        prev = lane.starts[i];
        expect(lane.durs[i]).toBeGreaterThanOrEqual(0);
        expect(lane.catIds[i]).toBeLessThan(CATEGORIES.length);
        expect(lane.nameIds[i]).toBeLessThan(model.names.length);
        expect(lane.depths[i]).toBeLessThanOrEqual(lane.meta.maxDepth);
      }
    }
  });

  it("keeps self time within event duration for stack lanes", async () => {
    const model = await fixtureModel();
    const main = model.lanes.find((l) => l.meta.kind === "main")!;
    for (let i = 0; i < main.starts.length; i++) {
      expect(main.selfTimes[i]).toBeLessThanOrEqual(main.durs[i] + 1e-6);
    }
  });

  it("extracts web vitals markers", async () => {
    const model = await fixtureModel();
    const names = model.markers.map((m) => m.name);
    expect(names).toContain("navigationStart");
    expect(names).toContain("firstContentfulPaint");
    expect(names).toContain("largestContentfulPaint::Candidate");
    for (const marker of model.markers) {
      expect(marker.ts).toBeGreaterThanOrEqual(0);
      expect(marker.ts).toBeLessThanOrEqual(model.rangeMs);
    }
  });

  it("gives network requests collision-free waterfall rows", async () => {
    const model = await fixtureModel();
    const net = model.lanes.find((l) => l.meta.kind === "network");
    expect(net).toBeDefined();
    expect(net!.starts.length).toBeGreaterThan(10);
    const rowEnds = new Map<number, number>();
    for (let i = 0; i < net!.starts.length; i++) {
      const row = net!.depths[i];
      const previousEnd = rowEnds.get(row) ?? -Infinity;
      expect(net!.starts[i]).toBeGreaterThanOrEqual(previousEnd - 1e-6);
      rowEnds.set(row, net!.starts[i] + net!.durs[i]);
    }
    expect(rowEnds.size).toBeGreaterThan(1);
  });

  it("extracts screenshots, frames, requests, memory and flows", async () => {
    const model = await fixtureModel();
    expect(model.screenshots.length).toBe(17);
    expect(model.screenshots[0].dataUri.startsWith("data:image")).toBe(true);
    expect(model.frames.length).toBeGreaterThan(5);
    expect(model.requests.length).toBeGreaterThan(10);
    expect(model.memory.length).toBeGreaterThan(50);
    expect(model.flows.length).toBeGreaterThan(0);
    for (const flow of model.flows) {
      expect(flow.points.length).toBeGreaterThanOrEqual(2);
      for (const p of flow.points) {
        expect(p.lane).toBeLessThan(model.lanes.length);
        expect(p.idx).toBeLessThan(model.lanes[p.lane].starts.length);
      }
    }
  });
});
