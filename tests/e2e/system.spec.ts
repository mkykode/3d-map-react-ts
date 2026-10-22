import { expect, test, type Page } from "@playwright/test";
import type { InstancedMesh, Object3D } from "three";
import type { SceneDebugHost } from "../../src/scene/diagnostics";
import type { useAppStore } from "../../src/state/store";
import { waitForSceneIdle } from "./sceneHarness";
import AxeBuilder from "@axe-core/playwright";
import type { ConnectionArc } from "../../src/scene/connectionGeometry";

async function openSystem(page: Page, hash = "view=system") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/?debug#${hash}`);
  await expect(page.locator(".stats")).toContainText("events");
  await waitForSceneIdle(page);
}

async function instancePoint(page: Page, name: string, index = 0) {
  return page.evaluate(({ name, index }) => {
    const host = document.getElementById("trace-camera") as SceneDebugHost;
    const root = host.traceScene!();
    const mesh = root.scene.getObjectByName(name) as InstancedMesh;
    const a = mesh.instanceMatrix.array, i = index * 16;
    const building = name === "system-buildings";
    const point = root.camera.position.clone().set(a[i + 12] + (building ? a[i] * 0.25 : 0), a[i + 13] + (building ? a[i + 5] / 2 : 0), a[i + 14] + (building ? a[i + 10] * 0.2 : 0)).applyMatrix4(mesh.matrixWorld).project(root.camera);
    const rect = root.gl.domElement.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  }, { name, index });
}

test("System draws the demo board and picks a thread through to Canyon", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSystem(page);
  const counts = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    return { buildings: (root.scene.getObjectByName("system-buildings") as InstancedMesh).count, requests: (root.scene.getObjectByName("system-requests") as InstancedMesh).count, calls: root.gl.info.render.calls };
  });
  expect(counts.requests).toBe(45);
  expect(counts.buildings).toBe(13);
  expect(counts.calls).toBeLessThanOrEqual(12);
  for (const label of ["monkeykode.com", "challenges.cloudflare.com", "vercel.live", "GPU"]) await expect(page.locator(".scene-label-district").filter({ hasText: label })).toBeVisible();
  const point = await instancePoint(page, "system-buildings");
  await page.mouse.move(point.x, point.y);
  await expect(page.getByRole("tooltip")).toContainText("Main — monkeykode.com");
  await expect(page.getByRole("tooltip")).toContainText("Chromium");
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole("complementary", { name: "Selection details" })).toContainText("Main — monkeykode.com");
  await page.getByRole("button", { name: "Open in Canyon" }).click();
  await expect(page).toHaveURL(/view=canyon/);
  await waitForSceneIdle(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Selection details" })).toHaveCount(0);
});

test("System arc evidence keeps recorded counts and opens exact source entries", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSystem(page);
  const target = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const state = root.scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>;
    const graph = state.model!.connections;
    const edge = graph.edges.findIndex((edge) => edge.fromLane === 0 && state.model!.lanes[edge.toLane].meta.threadId === 15363 && edge.provenance === "recorded");
    const mesh = root.scene.getObjectByName("connection-arcs") as InstancedMesh;
    const indices = (mesh.userData.arcIds as number[]).flatMap((id, i) => id === edge ? [i] : []);
    return { edge, segment: indices[Math.floor(indices.length / 2)] };
  });
  const point = await instancePoint(page, "connection-arcs", target.segment);
  await page.mouse.move(point.x, point.y);
  await expect(page.getByRole("tooltip")).toContainText("23 recorded links");
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole("complementary", { name: "Selection details" })).toContainText("23 recorded links");
  await page.locator(".connection-instance:enabled").first().click();
  await expect(page).toHaveURL(/view=canyon/);
  await expect(page.getByRole("complementary", { name: "Selection details" })).toContainText("Start");
});

for (const time of [null, 34.24]) test(`System has byte-identical pixels after reload at ${time ?? "overview"}`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSystem(page, `view=system${time === null ? "" : `&t=${time}`}`);
  if (time !== null) await expect(page.locator(".system-narration")).toContainText("19 requests are in flight");
  if (time !== null) {
    const requests = await page.evaluate(() => {
      const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
      const mesh = root.scene.getObjectByName("connection-packets") as InstancedMesh;
      return (mesh.userData.packets as { kind: string }[]).filter((packet) => packet.kind === "request").length;
    });
    expect(requests).toBe(19);
  }
  const first = await page.locator("canvas").screenshot();
  await page.reload();
  await expect(page.locator(".stats")).toContainText("events");
  await waitForSceneIdle(page);
  expect((await page.locator("canvas").screenshot()).equals(first)).toBe(true);
});

test("System clamps URL time, preserves explicit views, and follows the tab shortcuts", async ({ page }) => {
  await openSystem(page, "view=unknown&brush=20-50&t=9999");
  await expect(page.getByRole("button", { name: "System", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("slider", { name: "Playhead", exact: true })).toHaveValue("50");
  await page.keyboard.press("Alt+Digit2");
  await expect(page.getByRole("button", { name: "Canyon", exact: true })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Alt+Digit1");
  await expect(page.getByRole("button", { name: "System", exact: true })).toHaveAttribute("aria-current", "page");
  await openSystem(page, "view=canyon");
  await expect(page.getByRole("button", { name: "Canyon", exact: true })).toHaveAttribute("aria-current", "page");
});

test("reduced-motion playback steps between moments and pauses without idle frames", async ({ page }) => {
  await openSystem(page, "view=system&t=0");
  const slider = page.getByRole("slider", { name: "Playhead", exact: true });
  await page.getByRole("button", { name: "Next moment", exact: true }).click();
  const first = await slider.inputValue();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(300);
  await expect(slider).toHaveValue(first);
  await expect.poll(() => slider.inputValue(), { timeout: 2000 }).not.toBe(first);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await waitForSceneIdle(page);
  const count = await page.locator("#trace-camera").getAttribute("data-render-count");
  await page.waitForTimeout(400);
  await expect(page.locator("#trace-camera")).toHaveAttribute("data-render-count", count!);
  await slider.focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("button", { name: "Next moment", exact: true })).toBeDisabled();
});

test("System hides tracks and exposes its controls by keyboard at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?debug#view=system");
  await expect(page.getByRole("region", { name: "System playback" })).toBeVisible();
  await page.getByRole("button", { name: "Toolbar controls" }).click();
  await page.getByRole("button", { name: "tracks", exact: true }).click();
  await page.getByRole("checkbox", { name: /ThreadPoolForegroundWorker — monkeykode.com/ }).first().uncheck();
  await page.getByRole("button", { name: "Close tracks" }).click();
  await expect.poll(() => page.evaluate(() => ((document.getElementById("trace-camera") as SceneDebugHost).traceScene!().scene.getObjectByName("system-buildings") as InstancedMesh).count)).toBe(12);
  const play = page.getByRole("button", { name: "Play", exact: true });
  await play.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Next moment", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Playback speed" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("slider", { name: "Playhead", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await expect(page.getByRole("button", { name: "Fit all", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).include(".narration").include(".camera-cluster").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(audit.violations).toEqual([]);
});

test("Canyon caps displayed connections and identifies aggregate endpoints", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSystem(page, "view=canyon");
  const toggle = page.getByRole("button", { name: "Connections", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await waitForSceneIdle(page);
  const readArcs = () => page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    return root.scene.getObjectByName("connection-arcs")!.userData.arcs as ConnectionArc[];
  });
  const arcs = await readArcs();
  expect(arcs).toHaveLength(200);
  expect(arcs.some((arc) => arc.aggregate)).toBe(true);
  await expect(page.locator('[data-scene-label="canyon-connection-count"]')).toContainText("200 of");
  const point = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const mesh = root.scene.getObjectByName("connection-arcs") as InstancedMesh;
    const arcs = mesh.userData.arcs as ConnectionArc[];
    const aggregateIds = new Set(arcs.filter((arc) => arc.aggregate).map((arc) => arc.id));
    const colliders: Object3D[] = [mesh];
    root.scene.traverse((object) => { if (object.name.startsWith("pick-lane-")) colliders.push(object); });
    const rect = root.gl.domElement.getBoundingClientRect();
    for (let i = 0; i < mesh.count; i++) {
      if (!aggregateIds.has(mesh.userData.arcIds[i])) continue;
      const a = mesh.instanceMatrix.array, j = i * 16;
      const p = root.camera.position.clone().set(a[j + 12], a[j + 13], a[j + 14]).applyMatrix4(mesh.matrixWorld).project(root.camera);
      const x = rect.left + (p.x + 1) * rect.width / 2, y = rect.top + (1 - p.y) * rect.height / 2;
      if (document.elementFromPoint(x, y) !== root.gl.domElement) continue;
      root.raycaster.setFromCamera(root.pointer.clone().set(p.x, p.y), root.camera);
      const hit = root.raycaster.intersectObjects(colliders, false)[0];
      if (hit?.object === mesh && hit.instanceId !== undefined && aggregateIds.has(mesh.userData.arcIds[hit.instanceId])) return { x, y };
    }
    return null;
  });
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x, point!.y);
  await expect(page.getByRole("tooltip")).toContainText("Endpoint is an aggregate");
  await toggle.click();
  await toggle.click();
  await waitForSceneIdle(page);
  expect(await readArcs()).toEqual(arcs);
});

test("City selects an activity across entity districts and draws ranked caller arcs", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSystem(page, "view=city");
  const point = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const mesh = root.scene.getObjectByName("city-buildings") as InstancedMesh;
    const names = mesh.geometry.getAttribute("traceName");
    const rect = root.gl.domElement.getBoundingClientRect();
    const state = root.scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>;
    for (let i = 0; i < mesh.count; i++) {
      const name = names.getX(i);
      if (Array.from(names.array).filter((id) => id === name).length < 2) continue;
      const a = mesh.instanceMatrix.array, j = i * 16;
      const p = root.camera.position.clone().set(a[j + 12], a[j + 13] + a[j + 5] / 2, a[j + 14]).applyMatrix4(mesh.matrixWorld).project(root.camera);
      const x = rect.left + (p.x + 1) * rect.width / 2, y = rect.top + (1 - p.y) * rect.height / 2;
      if (document.elementFromPoint(x, y) !== root.gl.domElement) continue;
      root.raycaster.setFromCamera(root.pointer.clone().set(p.x, p.y), root.camera);
      if (root.raycaster.intersectObject(mesh)[0]?.instanceId === i) return { x, y, name: state.model!.names[name], nameId: name };
    }
    return null;
  });
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x, point!.y);
  await expect(page.getByRole("tooltip")).toContainText(point!.name);
  await page.mouse.click(point!.x, point!.y);
  await page.mouse.move(1, 1);
  await waitForSceneIdle(page);
  const selected = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const state = root.scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>;
    const arcs = root.scene.getObjectByName("connection-arcs")!.userData.arcs as ConnectionArc[];
    return { selection: state.selection, arcs, districts: (root.scene.getObjectByName("city-districts") as InstancedMesh).count };
  });
  expect(selected.selection).toEqual({ kind: "name", nameId: point!.nameId });
  expect(selected.districts).toBeGreaterThan(1);
  expect(selected.arcs.length).toBeGreaterThan(0);
  expect(selected.arcs.length).toBeLessThanOrEqual(16);
  expect(selected.arcs.every((arc) => arc.provenance === "derived")).toBe(true);
});
