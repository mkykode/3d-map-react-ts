import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  markerLabelForEvent,
  parseTrace,
  parseTraceForSession,
  selectDefaultNavigationId,
} from "./adapter";
import type { AdapterTraceResult } from "./adapter";
import { CATEGORIES } from "./categories";
import type { ParsedTraceModel } from "./types";
import { sessionId } from "../domain/analysis";
import { makeFullEnvelopeFixture } from "../test/traceEnvelopeFixtures";
import { ingestFullEnvelope } from "./worker/fullEnvelope";
import {
  canonicalizeTraceSession,
  commitTraceSession,
} from "./worker/traceSession";
import { TraceSessionRepository } from "./worker/sessionRepository";

const FIXTURE = fileURLToPath(
  new URL("../../public/demo-trace.json", import.meta.url),
);
const PARSE_BUDGET_MS = 15_000;

let cached: AdapterTraceResult | null = null;
function fixtureEvents(): unknown[] {
  const raw = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
    traceEvents: unknown[];
  };
  return raw.traceEvents;
}

async function fixtureModel(): Promise<ParsedTraceModel> {
  return (await fixtureResult()).projection;
}

async function fixtureResult(): Promise<AdapterTraceResult> {
  if (!cached) cached = await parseTraceForSession(fixtureEvents());
  return cached;
}

describe("adapter (trace_engine) on the demo fixture", () => {
  it("keeps canonical source samples from a thread beyond the rendering lane cap", async () => {
    const envelope = makeFullEnvelopeFixture({ runId: "beyond-lane-cap" });
    for (let threadIndex = 0; threadIndex < 25; threadIndex++) {
      const tid = 200 + threadIndex;
      envelope.traceEvents.push({
        name: "thread_name",
        cat: "__metadata",
        ph: "M",
        pid: 100,
        tid,
        ts: 0,
        args: { name: `Worker ${threadIndex}` },
      });
      const eventCount = threadIndex === 24 ? 1 : 25;
      for (let eventIndex = 0; eventIndex < eventCount; eventIndex++) {
        envelope.traceEvents.push({
          name: `WorkerTask${eventIndex}`,
          cat: "devtools.timeline",
          ph: "X",
          pid: 100,
          tid,
          ts: 20_000 + threadIndex * 100_000 + eventIndex * 2_000,
          dur: 1_000,
          callFrame: {
            functionName: threadIndex === 24 ? "beyondRenderingCap" : "workerTask",
            scriptId: String(threadIndex + 2),
            url: `https://example.test/worker-${threadIndex}.js`,
            lineNumber: eventIndex,
            columnNumber: 0,
          },
          args: {},
        });
      }
    }

    const result = await parseTraceForSession(envelope.traceEvents);

    expect(result.projection.lanes).toHaveLength(24);
    expect(result.projection.functionNames).not.toContain("beyondRenderingCap");
    expect(result.canonicalEvidence.sourceSamples.some(
      (sample) => sample.frame.functionName === "beyondRenderingCap",
    )).toBe(true);
  });

  it("canonicalizes complete envelope evidence with animation frames and millisecond timestamps", async () => {
    const envelope = makeFullEnvelopeFixture({ runId: "canonical-1" });
    (envelope.traceEvents as unknown[]).push(
      {
        cat: "devtools.timeline",
        name: "AnimationFrame",
        ph: "b",
        id: "animation-1",
        pid: 100,
        tid: 101,
        ts: 10_000,
        args: {
          id: "animation-1",
          animation_frame_timing_info: {
            blocking_duration_ms: 1,
            duration_ms: 16,
            num_scripts: 1,
          },
        },
      },
      {
        cat: "devtools.timeline",
        name: "AnimationFrame",
        ph: "e",
        id: "animation-1",
        pid: 100,
        tid: 101,
        ts: 26_000,
        args: {
          id: "animation-1",
          animation_frame_timing_info: {
            blocking_duration_ms: 1,
            duration_ms: 16,
            num_scripts: 1,
          },
        },
      },
    );
    const repository = new TraceSessionRepository();
    const id = sessionId("session:v1:canonical-1");
    const stage = await ingestFullEnvelope(
      new Blob([JSON.stringify(envelope)]),
      id,
      repository,
    );

    const canonical = await canonicalizeTraceSession(stage);
    expect(canonical.metadata).toEqual(envelope.metadata);
    expect(canonical.settings).toEqual(envelope.settings);
    expect(canonical.evidence.eventCount).toBe(envelope.traceEvents.length);
    expect(canonical.evidence.animationFrames).toHaveLength(1);
    expect(canonical.evidence.animationFrames[0]).toMatchObject({
      startMs: 9,
      durationMs: 16,
    });
    expect(canonical.compatibilityProjection.rangeMs).toBeGreaterThan(0);

    commitTraceSession(repository, stage, canonical);
    expect(stage.released).toBe(true);
    expect(repository.getCanonicalForWorker(id)).toMatchObject({
      metadata: envelope.metadata,
      settings: envelope.settings,
    });
  });

  it("recognizes soft-navigation markers and selects a soft-only default", () => {
    expect(markerLabelForEvent("SoftNavigationStart")).toBe("Nav");
    expect(
      markerLabelForEvent(
        "largestContentfulPaint::CandidateForSoftNavigation",
      ),
    ).toBe("LCP");
    expect(
      selectDefaultNavigationId(
        [
          { id: "child", frameId: "child-frame", start: 0 },
          { id: "soft:9", frameId: "main-frame", start: 8 },
          { id: "soft:3", frameId: "main-frame", start: 3 },
        ],
        "main-frame",
      ),
    ).toBe("soft:3");
  });

  it("keeps ownership explicitly absent for a generic trace", async () => {
    const model = await parseTrace([
      {
        cat: "test",
        name: "task",
        ph: "X",
        ts: 0,
        dur: 1_000,
        pid: 1,
        tid: 2,
        args: {},
      },
    ]);

    expect(model.mainFrameId).toBeNull();
    expect(model.mainFrameUrl).toBeNull();
    expect(model.defaultNavigationId).toBeNull();
    expect(model.navigations).toEqual([]);
    expect(model.documentFrames).toEqual([]);
  });

  it("parses within the perf budget", async () => {
    const started = performance.now();
    const model = await fixtureModel();
    expect(model.parseMs).toBeLessThan(PARSE_BUDGET_MS);
    expect(performance.now() - started).toBeLessThan(PARSE_BUDGET_MS);
  });

  it("retains canonical event keys for requests, frames, and metrics", async () => {
    const evidence = (await fixtureResult()).canonicalEvidence;
    expect(evidence.requests.length).toBeGreaterThan(0);
    expect(evidence.frames.length).toBeGreaterThan(0);
    expect(evidence.metrics.length).toBeGreaterThan(0);
    expect(evidence.requests.every((request) => request.eventKey !== null)).toBe(true);
    expect(evidence.frames.every((frame) => frame.eventKey !== null)).toBe(true);
    expect(evidence.metrics.every((metric) => metric.eventKey !== null)).toBe(true);
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

  it("preserves authoritative navigation, frame, and process ownership", async () => {
    const model = await fixtureModel();
    const navigationId = "319E2537F3B2AD3E7A76487A22AC4996";
    const mainFrameId = "CF37E3F4EA7759277C574314B12B8A2D";

    expect(model.mainFrameId).toBe(mainFrameId);
    expect(model.mainFrameUrl).toBe("https://monkeykode.com/");
    expect(model.defaultNavigationId).toBe(navigationId);
    expect(model.navigations).toHaveLength(6);
    expect(model.documentFrames).toHaveLength(6);

    const selectedNavigation = model.navigations.find(
      (navigation) => navigation.id === navigationId,
    );
    expect(selectedNavigation).toMatchObject({
      frameId: mainFrameId,
      processId: 95248,
      emittingThreadId: 259,
      url: "https://monkeykode.com/",
      isOutermostMainFrame: true,
      isLoadingMainFrame: true,
    });
    expect(selectedNavigation?.start).toBeCloseTo(2.64, 6);
    expect(selectedNavigation?.end).toBe(model.rangeMs);
    expect(model.processes.find((process) => process.id === 95248)).toMatchObject({
      name: "Renderer",
      url: "https://monkeykode.com/",
      isOnMainFrame: true,
      isBrowser: false,
      isGpu: false,
    });
    expect(model.processes.find((process) => process.id === 11178)?.isBrowser).toBe(true);
    expect(model.processes.find((process) => process.id === 11199)?.isGpu).toBe(true);

    const childFrame = model.documentFrames.find(
      (frame) => frame.id === "F3ACB4C9361EFB8E6139962CA204225B",
    );
    expect(childFrame).toMatchObject({
      parentId: mainFrameId,
      isOutermostMainFrame: false,
      isInPrimaryMainFrame: false,
    });
    expect(childFrame?.processWindows[0]).toMatchObject({
      processId: 95248,
      url: "about:srcdoc",
    });

    const mainFrame = model.documentFrames.find(
      (frame) => frame.id === mainFrameId,
    );
    expect(mainFrame).toMatchObject({
      isOutermostMainFrame: true,
      isInPrimaryMainFrame: true,
    });
    expect(mainFrame?.processWindows).toHaveLength(2);
    expect(mainFrame!.processWindows[0].end).toBeLessThan(
      mainFrame!.processWindows[1].start,
    );
    for (const frame of model.documentFrames) {
      for (const window of frame.processWindows) {
        expect(window.start).toBeLessThanOrEqual(window.end);
        expect(model.processes.some((process) => process.id === window.processId)).toBe(
          true,
        );
      }
    }

    const main = model.lanes.find((lane) => lane.meta.kind === "main")!;
    expect(main.meta).toMatchObject({
      processId: 95248,
      threadId: 259,
    });
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

  it("preserves sampled call-frame identity and source coordinates", async () => {
    const model = await fixtureModel();
    const main = model.lanes.find((lane) => lane.meta.kind === "main")!;
    expect(main.callFrameIds).toHaveLength(main.starts.length);
    const expectedUrl =
      "chrome-extension://aeblfdkhhhdcdjpifhhbdiojplfjncoa/inline/inject-content-scripts.js";
    const matchingEntry = main.callFrameIds.findIndex((id) => {
      if (id === 0) return false;
      const frame = model.callFrames[id - 1];
      return (
        model.functionNames[frame.functionNameId] === "f" &&
        model.scriptUrls[frame.urlId] === expectedUrl &&
        frame.lineNumber === 4 &&
        frame.columnNumber === 48
      );
    });
    expect(matchingEntry).toBeGreaterThanOrEqual(0);

    const network = model.lanes.find((lane) => lane.meta.kind === "network")!;
    expect(network.callFrameIds).toHaveLength(network.starts.length);
    expect([...network.callFrameIds]).toEqual(
      Array.from({ length: network.starts.length }, () => 0),
    );
  });

  it("preserves stable serializable event keys across repeated parses", async () => {
    const first = await fixtureModel();
    const second = await parseTrace(fixtureEvents());

    expect(second.eventKeys).toEqual(first.eventKeys);
    for (let laneIndex = 0; laneIndex < first.lanes.length; laneIndex++) {
      const firstLane = first.lanes[laneIndex];
      const secondLane = second.lanes[laneIndex];
      expect(firstLane.eventKeyIds).toHaveLength(firstLane.starts.length);
      expect(secondLane.eventKeyIds).toEqual(firstLane.eventKeyIds);
      for (const id of firstLane.eventKeyIds) {
        if (id > 0) expect(id).toBeLessThanOrEqual(first.eventKeys.length);
      }
    }

    const main = first.lanes.find((lane) => lane.meta.kind === "main")!;
    const profileEntry = main.callFrameIds.findIndex((id) => id > 0);
    expect(profileEntry).toBeGreaterThanOrEqual(0);
    expect(first.names[main.nameIds[profileEntry]]).toBe("ProfileCall");
    expect(main.eventKeyIds[profileEntry]).toBeGreaterThan(0);
    expect(first.eventKeys[main.eventKeyIds[profileEntry] - 1]).toMatch(/^p-/);
  });

  it("keeps self time within event duration for stack lanes", async () => {
    const model = await fixtureModel();
    const main = model.lanes.find((l) => l.meta.kind === "main")!;
    for (let i = 0; i < main.starts.length; i++) {
      expect(main.selfTimes[i]).toBeLessThanOrEqual(main.durs[i] + 1e-6);
    }
  });

  it("preserves parent indexes and exact exclusive intervals", async () => {
    const model = await fixtureModel();
    const stackLanes = model.lanes.filter(
      (lane) => lane.meta.kind === "main" || lane.meta.kind === "thread",
    );
    let parentedEntries = 0;

    for (const lane of stackLanes) {
      expect(lane.parentIndexes).toHaveLength(lane.starts.length);
      expect(lane.exclusiveOffsets).toHaveLength(lane.starts.length + 1);
      expect(lane.exclusiveOffsets[0]).toBe(0);
      expect(lane.exclusiveOffsets[lane.exclusiveOffsets.length - 1]).toBe(
        lane.exclusiveStarts.length,
      );
      expect(lane.exclusiveEnds).toHaveLength(lane.exclusiveStarts.length);

      let invalidIntervals = 0;
      let maxSelfTimeDifference = 0;
      for (let i = 0; i < lane.starts.length; i++) {
        const parentIndex = lane.parentIndexes[i];
        if (parentIndex >= 0) {
          parentedEntries++;
          expect(parentIndex).toBeLessThan(i);
          expect(lane.depths[parentIndex]).toBeLessThan(lane.depths[i]);
        }

        let exactSelfTime = 0;
        for (
          let interval = lane.exclusiveOffsets[i];
          interval < lane.exclusiveOffsets[i + 1];
          interval++
        ) {
          if (lane.exclusiveStarts[interval] >= lane.exclusiveEnds[interval]) {
            invalidIntervals++;
          }
          exactSelfTime +=
            lane.exclusiveEnds[interval] - lane.exclusiveStarts[interval];
        }
        maxSelfTimeDifference = Math.max(
          maxSelfTimeDifference,
          Math.abs(exactSelfTime - lane.selfTimes[i]),
        );
      }
      expect(invalidIntervals).toBe(0);
      expect(maxSelfTimeDifference).toBeLessThan(1e-6);
    }
    expect(parentedEntries).toBeGreaterThan(0);
  });

  it("extracts web vitals markers", async () => {
    const model = await fixtureModel();
    const names = model.markers.map((m) => m.name);
    expect(names).toContain("navigationStart");
    expect(names).toContain("firstContentfulPaint");
    expect(names).toContain("largestContentfulPaint::Candidate");
    const navigation = model.markers.find(
      (marker) => marker.name === "navigationStart",
    );
    expect(navigation).toMatchObject({
      navigationId: model.defaultNavigationId,
      frameId: model.mainFrameId,
      processId: 95248,
      threadId: 259,
    });
    expect(
      model.markers.every(
        (marker) =>
          marker.navigationId === model.defaultNavigationId &&
          marker.frameId === model.mainFrameId,
      ),
    ).toBe(true);
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
