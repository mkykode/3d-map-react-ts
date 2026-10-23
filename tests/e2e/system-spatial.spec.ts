import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { InstancedMesh } from "three";
import type { SceneDebugHost } from "../../src/scene/diagnostics";
import type { useAppStore } from "../../src/state/store";
import type { ConnectionArc } from "../../src/scene/connectionGeometry";
import { waitForSceneIdle } from "./sceneHarness";

async function openSystem(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?debug#view=system");
  await expect(page.getByRole("heading", { name: "Who owns this work?" })).toBeVisible();
  await waitForSceneIdle(page);
}

test("milestone scoping keeps ownership positions, the camera, and work units stable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSystem(page);
  const scene = () => page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const work = root.scene.getObjectByName("system-buildings") as InstancedMesh;
    const regions = root.scene.getObjectByName("system-plates") as InstancedMesh;
    const pads = root.scene.getObjectByName("system-thread-bases") as InstancedMesh;
    const model = (root.scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>).model!;
    return { regions: Array.from(regions.instanceMatrix.array), pads: Array.from(pads.instanceMatrix.array), work: Array.from(work.instanceMatrix.array), lanes: work.userData.lanes as number[], camera: root.camera.position.toArray(), pageWork: model.lanes[0].selfTimes.reduce((sum, value) => sum + value, 0) };
  });
  const whole = await scene();
  await page.getByRole("button", { name: "Before LCP", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Window start" })).toHaveValue("2.64");
  await expect(page.getByRole("slider", { name: "Window end" })).toHaveValue("123.138");
  await waitForSceneIdle(page);
  const beforePaint = await scene();
  expect(beforePaint.regions).toEqual(whole.regions);
  expect(beforePaint.pads).toEqual(whole.pads);
  expect(beforePaint.camera).toEqual(whole.camera);
  const pageLane = whole.lanes[0];
  const original = whole.lanes.indexOf(pageLane) * 16, clipped = beforePaint.lanes.indexOf(pageLane) * 16;
  expect(beforePaint.work[clipped + 12]).toBe(whole.work[original + 12]);
  expect(beforePaint.work[clipped + 14]).toBe(whole.work[original + 14]);
  expect(beforePaint.work[clipped + 5] / whole.work[original + 5]).toBeCloseTo(91.98 / whole.pageWork, 3);
  await expect(page.locator('[data-scene-label="system-lane-6"]')).toContainText("No work in this window");
  await expect(page.locator('[data-scene-label="system-scale-800"]')).toBeVisible();
  await page.getByRole("button", { name: "Whole recording" }).click();
  await waitForSceneIdle(page);
  expect(await scene()).toEqual(whole);
});

test("selecting a real owned request reveals only its resource endpoints and opens its evidence", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSystem(page);
  const target = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const model = (root.scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>).model!;
    const graph = model.connections;
    const instance = Array.from(graph.edgeIds).findIndex((id, i) => graph.edges[id].kind === "request" && graph.toIdx[i] >= 0 && graph.edges[id].fromLane === 0);
    const request = graph.toIdx[instance];
    const mesh = root.scene.getObjectByName("system-requests") as InstancedMesh;
    const matrix = mesh.instanceMatrix.array, j = request * 16;
    const anchor = [matrix[j + 12], matrix[j + 13] + matrix[j + 5] / 2, matrix[j + 14]];
    const point = root.camera.position.clone().set(anchor[0], anchor[1], anchor[2]).project(root.camera);
    const rect = root.gl.domElement.getBoundingClientRect();
    return { request, anchor, x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  });
  await page.mouse.click(target.x, target.y);
  await expect(page.getByRole("complementary", { name: "Selection details" })).toContainText("Requested by");
  await waitForSceneIdle(page);
  const routes = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const arcs = root.scene.getObjectByName("connection-arcs")!.userData.arcs as ConnectionArc[];
    return arcs.filter((arc) => arc.request !== undefined);
  });
  expect(routes.length).toBeGreaterThan(0);
  for (const route of routes) {
    expect(route.request).toBe(target.request);
    expect([route.from, route.to].some((point) => point.every((value, axis) => Math.abs(value - target.anchor[axis]) < 0.001))).toBe(true);
  }
  await page.getByRole("button", { name: "Open in Canyon", exact: true }).click();
  await expect(page.getByRole("button", { name: "Canyon", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("complementary", { name: "Selection details" })).toContainText("Request lifetime");
});

test("mobile milestone controls remain usable above the real 3D scene", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openSystem(page);
  await page.getByRole("combobox", { name: "Milestone", exact: true }).selectOption("fcp");
  const before = page.getByRole("button", { name: "Before FCP", exact: true });
  await before.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("slider", { name: "Window end" })).toHaveValue("123.138");
  await page.getByRole("button", { name: "Whole recording" }).click();
  await expect(page.getByRole("slider", { name: "Window start" })).toHaveValue("0");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator("#trace-camera canvas")).toBeVisible();
  const camera = page.locator("#trace-camera");
  const wholePose = JSON.parse((await camera.getAttribute("data-camera-pose"))!) as { target: number[] };
  await page.getByRole("button", { name: "Read components & requests ↓", exact: true }).click();
  await page.getByRole("button", { name: /Your page monkeykode.com.*thread work/ }).click();
  await expect(page.getByRole("complementary", { name: "Selection details" })).toContainText("Your page");
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await page.getByRole("button", { name: "Fit selection", exact: true }).click();
  await waitForSceneIdle(page);
  const focusedPose = JSON.parse((await camera.getAttribute("data-camera-pose"))!) as { target: number[] };
  expect(focusedPose.target).not.toEqual(wholePose.target);
  await expect(page.locator('[data-scene-label="system-process-95248"]')).toBeVisible();
});

test("missing page paint evidence leaves milestone filtering unavailable", async ({ page }) => {
  const fixture = JSON.parse(readFileSync("public/demo-trace.json", "utf8"));
  fixture.traceEvents = fixture.traceEvents.filter((event: { name: string }) => !["firstContentfulPaint", "largestContentfulPaint::Candidate"].includes(event.name));
  await page.route("**/demo-trace.json", (route) => route.fulfill({ json: fixture }));
  await openSystem(page);
  await expect(page.getByRole("region", { name: "System investigation window" })).toContainText("LCP is not recorded");
  await expect(page.getByRole("button", { name: "Before LCP" })).toBeDisabled();
  await expect(page.locator("#trace-camera canvas")).toBeVisible();
});
