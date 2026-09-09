import { expect, test } from "@playwright/test";
import type { InstancedMesh } from "three";
import type { SceneDebugHost } from "../../src/scene/diagnostics";
import type { useAppStore, useHoverStore } from "../../src/state/store";
import { makeTraceUpload, openWorkspace } from "./fixtures";
import { baseBufferVersions, visibleEventPoints, waitForSceneIdle } from "./sceneHarness";

test.setTimeout(120_000);

test("sparse named selections retain fixed-pixel annotations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkspace(page);
  await page.locator('input[type="file"]').first().setInputFiles(makeTraceUpload({ runId: "tiny-selection", eventCount: 1000, taskSpacingUs: 100_000, taskDurationUs: 1 }));
  await expect(page.locator(".stats")).not.toContainText("15,498", { timeout: 30_000 });
  await expect(page.locator(".stats")).toContainText("events");
  await waitForSceneIdle(page);
  await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const state = root.scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>;
    const lane = state.model!.lanes.find((l) => l.meta.kind === "main")!;
    state.setSelection({ kind: "name", nameId: lane.nameIds[0] });
  });
  await expect.poll(async () => page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    let count = 0;
    root.scene.traverse((object) => { if (object.name.startsWith("canyon-selection-markers-")) count += (object as import("three").Points).geometry.drawRange.count; });
    return count;
  })).toBeGreaterThan(0);
});

test("City fits an entry carried from Canyon to its displayed building", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  const nameId = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const state = root.scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>;
    const lane = state.model!.lanes.find((l) => l.meta.kind === "main")!;
    state.setSelection({ kind: "entry", lane: lane.meta.id, idx: 0 });
    return lane.nameIds[0];
  });
  await page.getByRole("button", { name: "City", exact: true }).click();
  await waitForSceneIdle(page);
  const expected = await page.evaluate((nameId) => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const mesh = root.scene.getObjectByName("city-buildings") as InstancedMesh;
    const names = Array.from(mesh.geometry.getAttribute("traceName").array);
    const index = names.includes(nameId) ? names.indexOf(nameId) : names.indexOf(-2);
    const a = mesh.instanceMatrix.array, i = index * 16;
    return root.camera.position.clone().set(a[i + 12], a[i + 13], a[i + 14]).applyMatrix4(mesh.matrixWorld).toArray();
  }, nameId);
  await page.getByRole("button", { name: "Fit selection", exact: true }).click();
  await waitForSceneIdle(page);
  const pose = JSON.parse((await page.locator("#trace-camera").getAttribute("data-camera-pose"))!);
  expected.forEach((value, axis) => expect(pose.target[axis]).toBeCloseTo(value, 2));
});

test("normal browsing excludes debug render telemetry", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  await page.getByRole("button", { name: "top", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible();
  expect(await page.locator("#trace-camera").getAttribute("data-render-count")).toBeNull();
  expect(await page.locator("#trace-camera").evaluate((host: SceneDebugHost) => typeof host.traceScene)).toBe("undefined");
});

test("aggregate views frame and annotate carried call ranges", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  await page.getByRole("button", { name: "FunctionCall", exact: true }).click();
  for (const view of ["Terrain", "Rhythm"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await waitForSceneIdle(page);
    await page.getByRole("button", { name: "Fit selection", exact: true }).click();
    await waitForSceneIdle(page);
    await expect(page.locator(`[data-scene-label="${view.toLowerCase()}-selection"]`)).toBeVisible();
  }
});

test("a settled canvas is pixel-identical after reloading the same trace", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  await waitForSceneIdle(page);
  const first = await page.locator("canvas").screenshot();
  await page.reload();
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  await waitForSceneIdle(page);
  const second = await page.locator("canvas").screenshot();
  expect(second.equals(first)).toBe(true);
});

test("Top and Side pick distinct visible Main and Network events, with scene feedback", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  await page.getByRole("button", { name: "Toggle table" }).click();
  for (const preset of ["top", "side"] as const) {
    await page.getByRole("button", { name: preset, exact: true }).click();
    await waitForSceneIdle(page);
    for (const lane of [0, 14]) {
      await expect.poll(async () => (await visibleEventPoints(page, lane, preset)).length).toBeGreaterThan(1);
      const points = await visibleEventPoints(page, lane, preset);
      for (const point of points.slice(0, 2)) {
        await page.mouse.move(point.x, point.y);
        await expect(page.getByRole("tooltip")).toBeVisible();
        const hover = await page.evaluate(() => {
          const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
          return (root.scene.userData.getHoverState() as ReturnType<typeof useHoverStore.getState>).hover;
        });
        expect(hover).toMatchObject({ lane, idx: point.idx });
        await page.mouse.click(point.x, point.y);
        await expect(page.locator('[data-scene-label="selected-event"]')).toBeVisible();
        const selected = await page.evaluate(() => {
          const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
          return (root.scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>).selection;
        });
        expect(selected).toEqual({ kind: "entry", lane, idx: point.idx });
        await page.keyboard.press("Escape");
      }
    }
  }
  expect(errors).toEqual([]);
});

test("brush and named selection preserve base instance buffers; aggregates expand", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  await waitForSceneIdle(page);
  const before = await baseBufferVersions(page);
  await page.getByRole("button", { name: "FunctionCall", exact: true }).click();
  await expect.poll(async () => page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    return (root.scene.getObjectByName("canyon-highlight-0") as InstancedMesh | undefined)?.count ?? 0;
  })).toBeGreaterThan(0);
  expect(await baseBufferVersions(page)).toEqual(before);
  await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const state = root.scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>;
    state.setBrush([100, 600]);
  });
  await expect(page.locator(".bottomup h3")).toContainText("600");
  expect(await baseBufferVersions(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Toggle table" }).click();
  await page.getByRole("button", { name: "top", exact: true }).click();
  await waitForSceneIdle(page);
  await expect.poll(async () => (await visibleEventPoints(page, 0, "top", true)).length).toBeGreaterThan(0);
  const point = (await visibleEventPoints(page, 0, "top", true))[0];
  await page.mouse.move(point.x, point.y);
  await expect(page.getByRole("tooltip")).toContainText("aggregated at this zoom");
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const state = root.scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>;
    return state.zoomed && !!state.brush && state.brush[1] - state.brush[0] < 20;
  })).toBe(true);
});

test("City palette survives rendering and every view settles with readable labels", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  await page.getByRole("button", { name: "City", exact: true }).click();
  await page.getByRole("button", { name: "top", exact: true }).click();
  await waitForSceneIdle(page);
  await expect(page.locator('[data-scene-label^="city-"]').first()).toBeAttached();
  const palette = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const mesh = root.scene.getObjectByName("city-buildings") as InstancedMesh;
    const a = mesh.instanceMatrix.array;
    const point = root.camera.position.clone().set(a[12], a[13] + a[5] / 2, a[14]).applyMatrix4(mesh.matrixWorld).project(root.camera);
    root.gl.render(root.scene, root.camera);
    const gl = root.gl.getContext();
    const pixel = new Uint8Array(4);
    gl.readPixels(Math.floor((point.x + 1) / 2 * gl.drawingBufferWidth), Math.floor((point.y + 1) / 2 * gl.drawingBufferHeight), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const color = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as import("three").MeshBasicMaterial;
    const expected = color.color.clone(); mesh.getColorAt(0, expected);
    return { actual: Array.from(pixel.slice(0, 3)).map((n) => n.toString(16).padStart(2, "0")).join(""), expected: expected.getHexString(), toneMapping: root.gl.toneMapping };
  });
  expect(palette.toneMapping).toBe(0);
  expect(palette.actual).toBe(palette.expected);
  for (const view of ["Terrain", "Rhythm", "City", "Canyon"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await page.getByRole("button", { name: "orbit", exact: true }).click();
    await waitForSceneIdle(page);
    await expect.poll(async () => page.locator(".scene-label").evaluateAll((labels) => labels.filter((label) => getComputedStyle(label).visibility === "visible").length)).toBeGreaterThan(0);
    await page.screenshot({ path: test.info().outputPath(`${view.toLowerCase()}.png`) });
  }
  expect(errors).toEqual([]);
});
