import { expect, test, type Page } from "@playwright/test";
import type { OrthographicCamera, PerspectiveCamera } from "three";
import type { SceneDebugHost } from "../../src/scene/diagnostics";
import type { CameraControlsHandle } from "../../src/scene/cameraFlight";
import type { useAppStore } from "../../src/state/store";
import { openWorkspace } from "./fixtures";
import { visibleEventPoints, waitForSceneIdle } from "./sceneHarness";

test.setTimeout(60_000);

async function livePose(page: Page) {
  return page.locator("#trace-camera").evaluate((host: SceneDebugHost) => {
    const root = host.traceScene!();
    return {
      position: root.camera.position.toArray(),
      target: (root.controls as CameraControlsHandle).target.toArray(),
      zoom: root.camera.zoom,
    };
  });
}

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  for (const preset of ["orbit", "top", "side"] as const) {
    test(`${preset} preserves navigation on resize (${reducedMotion})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.setViewportSize({ width: 1440, height: 900 });
      await openWorkspace(page);
      await expect(page.locator(".stats")).toContainText("events");
      await page.getByRole("button", { name: preset, exact: true }).click();
      await waitForSceneIdle(page);
      await page.getByRole("button", { name: "Pan right", exact: true }).click();
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
      await waitForSceneIdle(page);
      const before = await livePose(page);
      await page.setViewportSize({ width: 760, height: 1000 });
      await waitForSceneIdle(page);
      const after = await livePose(page);
      before.position.forEach((value, i) => expect(after.position[i]).toBeCloseTo(value, 5));
      before.target.forEach((value, i) => expect(after.target[i]).toBeCloseTo(value, 5));
      expect(after.zoom).toBeCloseTo(before.zoom, 5);
      // Explicit framing must still use the new viewport.
      await page.setViewportSize({ width: 1100, height: 900 });
      await waitForSceneIdle(page);
      await page.getByRole("button", { name: "Fit all", exact: true }).click();
      await waitForSceneIdle(page);
      expect(await livePose(page)).not.toEqual(before);
    });
  }
}

test("Free orbit crosses the floor, Strategy restores its safety bounds", async ({ page }) => {
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events");
  await waitForSceneIdle(page);
  await page.getByRole("button", { name: "Pan right", exact: true }).click();
  await waitForSceneIdle(page);
  const before = await livePose(page);
  await page.getByRole("button", { name: "Free camera", exact: true }).click();
  await waitForSceneIdle(page);
  expect(await livePose(page)).toEqual(before);
  const stage = page.locator("#trace-camera");
  await stage.focus();
  await page.keyboard.down("f");
  await expect.poll(async () => (await livePose(page)).position[1]).toBeLessThan(-5);
  await page.keyboard.up("f");
  await waitForSceneIdle(page);
  await page.getByRole("button", { name: "Strategy camera", exact: true }).click();
  await waitForSceneIdle(page);
  expect((await livePose(page)).position[1]).toBeGreaterThanOrEqual(1.5);
});

test("empty canvas preserves selection; Escape and Clear selection remove it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events");
  await page.getByRole("button", { name: "top", exact: true }).click();
  await waitForSceneIdle(page);
  const lane = await page.locator("#trace-camera").evaluate((host: SceneDebugHost) => {
    const state = host.traceScene!().scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>;
    return state.model!.lanes.find((lane) => lane.meta.kind === "main")!.meta.id;
  });
  const [point] = await visibleEventPoints(page, lane, "top");
  expect(point).toBeDefined();
  for (const clear of ["escape", "button"]) {
    await page.mouse.click(point.x, point.y);
    await expect(page.getByRole("button", { name: "Clear selection" })).toBeVisible();
    const empty = await page.locator("#trace-camera").evaluate((host: SceneDebugHost) => {
      const root = host.traceScene!();
      const rect = root.gl.domElement.getBoundingClientRect();
      for (let y = 140; y < rect.height - 130; y += 20) {
        for (let x = rect.width - 30; x > 350; x -= 20) {
          if (document.elementFromPoint(rect.left + x, rect.top + y) !== root.gl.domElement) continue;
          root.raycaster.setFromCamera(root.pointer.clone().set(x / rect.width * 2 - 1, 1 - y / rect.height * 2), root.camera);
          const hits = root.raycaster.intersectObjects(root.scene.children, true);
          if (hits.some((hit) => hit.object.name.startsWith("pick-lane-"))) continue;
          return { x: rect.left + x, y: rect.top + y };
        }
      }
      throw new Error("No unobstructed empty canvas point");
    });
    await page.mouse.click(empty.x, empty.y);
    await expect(page.getByRole("button", { name: "Clear selection" })).toBeVisible();
    if (clear === "escape") await page.keyboard.press("Escape");
    else await page.getByRole("button", { name: "Clear selection" }).click();
    await expect(page.getByRole("button", { name: "Clear selection" })).toHaveCount(0);
  }
});

test("tall Side flight keeps bounded FOV and matches orthographic scale on landing", async ({ page }) => {
  await openWorkspace(page);
  const traceEvents = Array.from({ length: 24 }, (_, tid) => [
    { name: "thread_name", cat: "__metadata", ph: "M", pid: 100, tid, ts: 0, args: { name: tid === 0 ? "CrRendererMain" : `Worker ${tid}` } },
    ...Array.from({ length: 41 }, (_, depth) => ({ name: `Task ${depth}`, cat: "devtools.timeline", ph: "X", pid: 100, tid, ts: 1000 + depth * 100, dur: 100_000 - depth * 200 })),
  ]).flat();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "tall.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ traceEvents })) });
  await expect(page.locator(".stats")).toContainText("984 events");
  await page.locator("#trace-camera").evaluate((host: SceneDebugHost) => {
    (host.traceScene!().scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>).setHiddenLanes(new Set());
  });
  await waitForSceneIdle(page);
  await page.locator("#trace-camera").evaluate((host: SceneDebugHost) => {
    let maxFov = 0, lastPerspectiveHeight = 0;
    const sample = () => {
      const root = host.traceScene!();
      const camera = root.camera as PerspectiveCamera | OrthographicCamera;
      if ("fov" in camera) {
        maxFov = Math.max(maxFov, camera.fov);
        lastPerspectiveHeight = 2 * camera.position.distanceTo((root.controls as CameraControlsHandle).target) * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
        requestAnimationFrame(sample);
      } else {
        host.dataset.flightProbe = JSON.stringify({ maxFov, lastPerspectiveHeight, orthoHeight: (camera.top - camera.bottom) / camera.zoom });
      }
    };
    requestAnimationFrame(sample);
  });
  await page.getByRole("button", { name: "side", exact: true }).click();
  await waitForSceneIdle(page);
  const probe = JSON.parse((await page.locator("#trace-camera").getAttribute("data-flight-probe"))!);
  expect(probe.maxFov).toBeLessThanOrEqual(90);
  expect(Math.abs(probe.lastPerspectiveHeight / probe.orthoHeight - 1)).toBeLessThan(0.01);
});
