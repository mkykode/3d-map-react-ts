import { expect, test } from "@playwright/test";
import type { InstancedMesh } from "three";
import type { SceneDebugHost } from "../../src/scene/diagnostics";
import type { PlaybackPacket } from "../../src/engine/moments";
import type { useAppStore } from "../../src/state/store";
import { waitForSceneIdle } from "./sceneHarness";

test("packets remain pickable after hovering the empty overview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?debug#view=system");
  await expect(page.locator(".stats")).toContainText("events");
  await waitForSceneIdle(page);
  await page.mouse.move(720, 200);
  await page.evaluate(() => { location.hash = "view=system&t=34.24"; });
  await expect(page.getByRole("slider", { name: "Playhead", exact: true })).toHaveValue("34.24");
  await waitForSceneIdle(page);
  const point = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const mesh = root.scene.getObjectByName("connection-packets") as InstancedMesh;
    const packets = mesh.userData.packets as PlaybackPacket[];
    const rect = root.gl.domElement.getBoundingClientRect();
    const colliders = [mesh, ...["system-buildings", "system-requests", "connection-arcs"].map((name) => root.scene.getObjectByName(name)!)];
    for (let i = 0; i < mesh.count; i++) {
      const packet = packets[i];
      if (packet.kind !== "request") continue;
      const a = mesh.instanceMatrix.array, j = i * 16;
      const p = root.camera.position.clone().set(a[j + 12], a[j + 13], a[j + 14]).project(root.camera);
      const x = rect.left + (p.x + 1) * rect.width / 2, y = rect.top + (1 - p.y) * rect.height / 2;
      if (document.elementFromPoint(x, y) !== root.gl.domElement) continue;
      root.raycaster.setFromCamera(root.pointer.clone().set(p.x, p.y), root.camera);
      const hit = root.raycaster.intersectObjects(colliders, false)[0];
      if (hit?.object === mesh && hit.instanceId === i) return { x, y, request: packet.request };
    }
    return null;
  });
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x, point!.y);
  await expect(page.getByRole("tooltip")).toContainText("Request activity");
  await page.mouse.click(point!.x, point!.y);
  await expect(page).toHaveURL(/view=canyon/);
  await expect(page.getByRole("complementary", { name: "Selection details" })).toContainText("Start");
});

test("opening a crossing connection reveals its source outside the zoomed brush", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?debug#view=system&brush=100-200");
  await expect(page.locator(".stats")).toContainText("events");
  await waitForSceneIdle(page);
  await page.keyboard.press("Alt+KeyZ");
  const target = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const model = (root.scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>).model!;
    const graph = model.connections;
    for (let i = 0; i < graph.edgeIds.length; i++) {
      const edge = graph.edges[graph.edgeIds[i]], idx = graph.fromIdx[i];
      const lane = model.lanes[edge.fromLane];
      if (edge.kind === "consumer" && idx >= 0 && graph.toIdx[i] >= 0 && lane.starts[idx] + lane.durs[idx] < 100 && graph.ends[i] >= 100 && graph.ends[i] < 200) {
        return { edge: graph.edgeIds[i], lane: edge.fromLane, idx, label: `${graph.starts[i].toFixed(2)} → ${graph.ends[i].toFixed(2)} ms` };
      }
    }
    return null;
  });
  expect(target).not.toBeNull();
  await page.locator(".narration summary").click();
  await page.getByRole("combobox", { name: "Select connection" }).selectOption(String(target!.edge));
  await page.locator(".connection-instance").filter({ hasText: target!.label }).first().click();
  await expect(page).toHaveURL(/view=canyon/);
  await waitForSceneIdle(page);
  const visible = await page.evaluate(({ lane, idx }) => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const mesh = root.scene.getObjectByName(`canyon-lane-${lane}`) as InstancedMesh;
    return (mesh.userData.sourceIndices as number[]).includes(idx);
  }, target!);
  expect(visible).toBe(true);
});

test("mobile keyboard focus leaves Camera without obscuring playback controls", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/#view=system");
  await expect(page.getByRole("region", { name: "System playback" })).toBeVisible();
  await page.locator(".narration summary").click();
  const camera = page.getByRole("button", { name: "Camera", exact: true });
  await camera.click();
  await page.getByRole("button", { name: "Reset view", exact: true }).focus();
  await page.keyboard.press("Tab");
  const play = page.getByRole("button", { name: "Play", exact: true });
  await expect(play).toBeFocused();
  await page.keyboard.press("Tab");
  const next = page.getByRole("button", { name: "Next moment", exact: true });
  await expect(next).toBeFocused();
  const unobscured = await next.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  });
  expect(unobscured).toBe(true);
  await camera.click();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await expect(camera).toBeFocused();
  await expect(camera).toHaveAttribute("aria-expanded", "false");
});
