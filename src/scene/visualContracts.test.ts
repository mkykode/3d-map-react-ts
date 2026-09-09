import { describe, expect, it } from "vitest";
import { BoxGeometry, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, Ray, Vector3 } from "three";
import { bottomUp, bucketize, rhythmFold } from "../engine/aggregate";
import { CATEGORIES } from "../engine/categories";
import { sceneLane, sceneModel } from "../test/sceneFixtures";
import { eventBounds, traceLayout } from "./traceLayout";
import { canyonSpans, isVisibleSpan, tinySelectionSpans } from "./canyonLod";
import { buildPickIndex, pickLaneRay } from "./picking";
import { indexRenderedLane } from "./renderedLane";
import { cityBuildingForName, cityBuildings } from "./cityLayout";
import { aggregateSelectionBounds, selectionNameId } from "./traceSelection";
import { cameraFootprint } from "./viewportFootprint";
import { boundedZoomFactor, constrainCamera, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM } from "./cameraLimits";
import { poseForBounds } from "./cameraActions";
import type { CameraControlsHandle } from "./cameraFlight";
import { rhythmLayout, sceneBounds } from "./sceneBounds";
import { uploadInstances, writeBox } from "./instanceBuffers";

describe("readable, faithful scene contracts", () => {
  it("maps carried selections onto the actual Terrain and Rhythm grids", () => {
    const model = sceneModel([sceneLane([{ start: 1020, dur: 10 }], 7), sceneLane([{ start: 0, dur: 100 }], 8)], 2000);
    const selection = { kind: "entry", lane: 7, idx: 0 } as const;
    expect(aggregateSelectionBounds(model, selection, new Set(), "terrain", [1000, 1100])).toEqual({ min: [32, 0, 4.5], max: [48, 10, 9.5] });
    expect(aggregateSelectionBounds(model, selection, new Set(), "rhythm", [0, 2000])).toEqual({ min: [80, 0, 1.2], max: [100, 8, expect.closeTo(1.8, 7)] });
    expect(aggregateSelectionBounds(model, selection, new Set([7]), "rhythm", [0, 2000])).toBeNull();
  });

  it("matches a cell-by-cell rhythm reference across partial and grouped seconds", () => {
    const events = Array.from({ length: 80 }, (_, i) => ({ start: i * 5321.13, dur: (i * 73.21) % 3900 + 0.123 }));
    const range = 500_000;
    const grid = rhythmFold(sceneLane(events), range);
    const expected = new Float64Array(grid.cells.length);
    for (const event of events) {
      const end = Math.min(range, event.start + event.dur);
      for (let t = event.start; t < end;) {
        const absoluteCell = Math.floor(t / 10), cellEnd = (absoluteCell + 1) * 10;
        const column = Math.floor(Math.floor(t / 1000) / grid.secondsPerColumn);
        expected[column * 100 + absoluteCell % 100] += Math.min(end, cellEnd) - t;
        t = cellEnd;
      }
    }
    expected.forEach((value, i) => expect(grid.cells[i]).toBeCloseTo(value, 4));
  });
  it("annotates sparse tiny selected calls without inflating their duration", () => {
    const lane = sceneLane(Array.from({ length: 1000 }, (_, i) => ({ start: i, dur: 0.001 })));
    const spans = canyonSpans(lane, buildPickIndex(lane), 0, 1000, 0.1);
    expect(spans.filter((s) => isVisibleSpan(s, 0.1))).toHaveLength(0);
    const markers = tinySelectionSpans(spans, 0.1);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.length).toBeLessThanOrEqual(128);
    expect(markers[0].end - markers[0].start).toBe(0.001);
  });

  it("resolves City entry, named, zero-self, and folded selections to displayed buildings", () => {
    const lane = sceneLane(Array.from({ length: 90 }, (_, i) => ({ start: i, dur: 1, self: i === 89 ? 0 : 1, name: i })), 7);
    const model = sceneModel([lane]);
    const city = cityBuildings(model, new Set(), 0, 1000);
    expect(selectionNameId(model, null)).toBeNull();
    expect(selectionNameId(model, { kind: "entry", lane: 7, idx: 89 })).toBe(89);
    expect(cityBuildingForName(city, 89)?.row.nameId).toBe(-1);
    expect(cityBuildingForName(city, 0)?.row.nameId).toBe(0);
    expect(cityBuildingForName(city, 999)).toBeNull();
    const zeroCity = cityBuildings(sceneModel([sceneLane([{ start: 0, dur: 10, self: 0 }])]), new Set(), 0, 1000);
    expect(zeroCity.buildings).toHaveLength(1);
    expect(zeroCity.buildings[0].row.self).toBe(0);
  });

  it.each(["top", "side"] as const)("generates reachable %s zoom destinations at viewport extremes", (preset) => {
    for (const viewport of [{ width: 900, height: 210 }, { width: 10_000, height: 10_000 }]) {
      const pose = poseForBounds({ min: [0, 0, 0], max: [160, 682, 900] }, preset, viewport, "strategy");
      expect(pose.zoom).toBeGreaterThanOrEqual(MIN_CAMERA_ZOOM);
      expect(pose.zoom).toBeLessThanOrEqual(MAX_CAMERA_ZOOM);
    }
  });
  it("reduces 100k subpixel events without losing their aggregate count or self cost", () => {
    const lane = sceneLane(Array.from({ length: 100_000 }, (_, i) => ({ start: i / 100, dur: 0.01, depth: i % 5, name: i % 3 })));
    const spans = canyonSpans(lane, buildPickIndex(lane), 0, 1000, 1);
    expect(spans.length).toBeLessThan(2600);
    expect(spans.reduce((sum, s) => sum + s.count, 0)).toBe(100_000);
    expect(spans.reduce((sum, s) => sum + s.self, 0)).toBeCloseTo(1000, 5);
    expect(spans.some((s) => s.nameId === -1)).toBe(true);
    expect(canyonSpans(lane, buildPickIndex(lane), 500, 501, 0.0001)).toHaveLength(100);
  });

  it("keeps real temporal gaps and clips spanning entries using the interval index", () => {
    const lane = sceneLane([{ start: 0, dur: 100 }, { start: 20, dur: 1, depth: 1 }, { start: 25, dur: 1, depth: 1 }]);
    const spans = canyonSpans(lane, buildPickIndex(lane), 10, 30, 1);
    expect(spans.map((s) => [s.start, s.end])).toEqual([[10, 30], [20, 21], [25, 26]]);
  });

  it("preserves status warnings when a small flagged event joins an aggregate", () => {
    const lane = sceneLane([{ start: 0, dur: 0.4 }, { start: 0.5, dur: 0.5 }]);
    const spans = canyonSpans(lane, buildPickIndex(lane), 0, 10, 1, new Uint8Array([0, 2]));
    expect(spans[0].status).toBe(2);
  });

  it("picks displayed aggregate geometry, never omitted source slivers", () => {
    const lane = sceneLane([{ start: 0, dur: 0.4 }, { start: 0.5, dur: 0.5 }]);
    const spans = canyonSpans(lane, buildPickIndex(lane), 0, 10, 1);
    expect(spans[0].count).toBe(2);
    const rendered = indexRenderedLane(lane, spans);
    const hit = pickLaneRay(rendered.geometry, rendered.index, new Ray(new Vector3(7.2, 10, 0), new Vector3(0, -1, 0)), false, 0, 10);
    expect(hit?.idx).toBe(0);
    const empty = indexRenderedLane(lane, []);
    expect(pickLaneRay(empty.geometry, empty.index, new Ray(new Vector3(7.2, 10, 0), new Vector3(0, -1, 0)), false, 0, 10)).toBeNull();
  });

  it.each(["orbit", "top", "side"] as const)("preserves every deep stack level in %s", (preset) => {
    const lane = sceneLane(Array.from({ length: 161 }, (_, depth) => ({ start: 0, dur: 10, depth })));
    const layout = traceLayout([lane, sceneLane([{ start: 0, dur: 5 }], 1)], preset);
    const boxes = Array.from({ length: 161 }, (_, i) => eventBounds(layout.placements[0], i, 0, 10)!);
    const axis = preset === "top" ? 2 : 1;
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].min[axis]).toBeGreaterThan(boxes[i - 1].max[axis]);
    expect(layout.placements[0].levelH).toBe(layout.placements[1].levelH);
    if (preset === "orbit") expect(layout.placements[0].z).toBeGreaterThan(layout.placements[1].z);
    if (preset === "side") expect(layout.placements[1].y).toBeGreaterThan(layout.placements[0].height);
  });

  it("encodes self share as thickness without altering duration or stack level", () => {
    const lane = sceneLane([{ start: 0, dur: 10, self: 1 }, { start: 10, dur: 10, self: 9 }]);
    const placement = traceLayout([lane], "orbit").placements[0];
    const a = eventBounds(placement, 0, 0, 20)!, b = eventBounds(placement, 1, 0, 20)!;
    expect(a.max[0] - a.min[0]).toBe(b.max[0] - b.min[0]);
    expect(a.max[1]).toBe(b.max[1]);
    expect(b.max[2] - b.min[2]).toBeGreaterThan(a.max[2] - a.min[2]);
  });

  it("retains all City cost in bounded buildings, including the labeled remainder", () => {
    const lane = sceneLane(Array.from({ length: 90 }, (_, i) => ({ start: i, dur: 1, name: i })));
    const model = sceneModel([lane]);
    const city = cityBuildings(model, new Set(), 0, 1000);
    const rows = bottomUp([lane], 0, 1000);
    expect(city.buildings).toHaveLength(60);
    expect(city.folded).toBe(31);
    expect(city.buildings.reduce((n, b) => n + b.row.self, 0)).toBe(rows.reduce((n, r) => n + r.self, 0));
    expect(city.buildings.reduce((n, b) => n + b.rect.w * b.rect.h, 0)).toBeCloseTo(70 * 70, 5);
    expect(sceneBounds(model, "city", new Set(), "orbit")).toEqual({ min: [45, 0, 0], max: [115, 17, 70] });
  });

  it("retains terrain category mixtures and bounded long-trace rhythm totals", () => {
    const lane = sceneLane([{ start: 0, dur: 4, cat: 2 }, { start: 4, dur: 6, cat: 3 }]);
    const grid = bucketize([lane], 0, 10, 1);
    expect(grid.lanes[0].categoryTimes[2]).toBe(4);
    expect(grid.lanes[0].categoryTimes[3]).toBe(6);
    expect(grid.lanes[0].categoryTimes.length).toBe(CATEGORIES.length);
    const long = sceneLane(Array.from({ length: 1000 }, (_, i) => ({ start: i * 1000 + 20, dur: 10 })));
    const rhythm = rhythmFold(long, 1_000_000, 10);
    expect(rhythm.cells.length).toBeLessThanOrEqual(25_600);
    expect(rhythm.cells.reduce((n, v) => n + v, 0)).toBe(10_000);
    expect(rhythmLayout(1_000_000).seconds).toBe(rhythm.seconds);
    expect(rhythmLayout(1111).width).toBe(40);
  });

  it("folds hours of continuous work by columns, not millions of time-cell iterations", () => {
    const lane = sceneLane([{ start: 0, dur: 36_000_000 }]);
    const grid = rhythmFold(lane, 36_000_000);
    expect(grid.cells.length).toBeLessThanOrEqual(25_600);
    expect(grid.cells.reduce((sum, value) => sum + value, 0)).toBe(36_000_000);
    expect(() => rhythmFold(lane, Infinity)).toThrow(RangeError);
    expect(() => rhythmFold(lane, 1000, 0)).toThrow(RangeError);
    expect(() => rhythmFold(lane, 1000, 3)).toThrow(RangeError);
  });

  it.each(["top", "side"] as const)("keeps time left-to-right in %s", (preset) => {
    const bounds = { min: [0, 0, 0], max: [160, 40, 60] } as const;
    const pose = poseForBounds(bounds, preset, { width: 1200, height: 800 }, "strategy");
    const camera = new OrthographicCamera(-600, 600, 400, -400, 1, 4000);
    camera.position.set(...pose.position);
    if (preset === "top") camera.up.set(0, 0, -1);
    camera.lookAt(...pose.target); camera.updateMatrixWorld();
    expect(new Vector3(160, 0, 0).project(camera).x).toBeGreaterThan(new Vector3(0, 0, 0).project(camera).x);
  });

  it("clips camera footprints at the horizon and bounds", () => {
    const camera = new PerspectiveCamera(50, 1.5, 1, 900);
    const bounds = { min: [0, 0, 0], max: [160, 20, 100] } as const;
    camera.position.set(80, 2, 110); camera.lookAt(80, 2, 0); camera.updateMatrixWorld();
    const polygon = cameraFootprint(camera, bounds);
    expect(polygon.length).toBeGreaterThanOrEqual(3);
    for (const p of polygon) { expect(p.every(Number.isFinite)).toBe(true); expect(p[0]).toBeGreaterThanOrEqual(-1e-7); expect(p[0]).toBeLessThanOrEqual(160 + 1e-7); expect(p[2]).toBeGreaterThanOrEqual(-1e-7); expect(p[2]).toBeLessThanOrEqual(100 + 1e-7); }
  });

  it("clamps perspective distance, orthographic zoom, and the floor before drift", () => {
    const camera = new PerspectiveCamera(); camera.position.set(0, -5, 6);
    const controls = { object: camera, target: new Vector3(0, -5, 0), minDistance: 6, maxDistance: 600, minZoom: 0.25, maxZoom: 250 } as CameraControlsHandle;
    expect(boundedZoomFactor(controls, 0.2)).toBe(1);
    constrainCamera(controls, "free");
    expect(camera.position.y).toBe(-5); expect(controls.target.y).toBe(-5);
    constrainCamera(controls, "strategy");
    expect(camera.position.y).toBe(1.5); expect(controls.target.y).toBe(1.5);
    const ortho = new OrthographicCamera(); ortho.zoom = 250; controls.object = ortho;
    expect(boundedZoomFactor(controls, 0.2)).toBe(1);
    ortho.zoom = 0.25; expect(boundedZoomFactor(controls, 5)).toBe(1);
  });

  it("uploads only populated instance ranges and uses analytical bounds", () => {
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 100);
    writeBox(mesh, 0, 2, 3, 4, 5, 6, 7);
    uploadInstances(mesh, 1, { min: [0, 0, 0], max: [10, 10, 10] });
    expect(mesh.count).toBe(1); expect(mesh.instanceMatrix.usage).toBe(DynamicDrawUsage);
    expect(mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 16 }]);
    expect(mesh.boundingSphere?.center.toArray()).toEqual([5, 5, 5]);
    mesh.geometry.dispose(); (mesh.material as MeshBasicMaterial).dispose(); mesh.dispose();
  });
});
