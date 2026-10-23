import { expect, test, type Page } from "@playwright/test";
import type { InstancedMesh } from "three";
import type { SceneDebugHost } from "../../src/scene/diagnostics";
import { waitForSceneIdle } from "./sceneHarness";

async function openSystem(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?debug#view=system");
  await expect(page.getByRole("heading", { name: "Who owns this work?", exact: true })).toBeVisible();
  await waitForSceneIdle(page);
}

test("Fit all and zoom out retain wide ownership maps in every projection on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openSystem(page);
  for (const count of [9, 32]) {
    await page.evaluate(async (count) => {
      const storePath = "/src/state/store.ts", fixturesPath = "/src/test/sceneFixtures.ts";
      const { useAppStore } = await import(storePath) as typeof import("../../src/state/store");
      const { sceneModel, sceneLane } = await import(fixturesPath) as typeof import("../../src/test/sceneFixtures");
      const model = sceneModel(Array.from({ length: count }, (_, id) => sceneLane([{ start: 0, dur: 100 }], id)), 100);
      useAppStore.setState({ model, hiddenLanes: new Set(), selection: null, brush: null, playhead: null, preset: "orbit" });
    }, count);
    await waitForSceneIdle(page);
    const camera = page.getByRole("button", { name: "Camera", exact: true });
    if (await camera.getAttribute("aria-expanded") === "false") await camera.click();
    for (const preset of ["orbit", "top", "side"]) {
      await page.getByRole("button", { name: preset, exact: true }).click();
      await page.getByRole("button", { name: "Fit all", exact: true }).click();
      await waitForSceneIdle(page);
      for (const zoomOut of [false, true]) {
        if (zoomOut) {
          await page.getByRole("button", { name: "Zoom out", exact: true }).click();
          await waitForSceneIdle(page);
        }
        const projected = await page.evaluate(() => {
          const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
          const plates = root.scene.getObjectByName("system-plates") as InstancedMesh;
          const matrix = plates.instanceMatrix.array;
          return Array.from({ length: plates.count }, (_, i) => {
            const j = i * 16;
            return root.camera.position.clone().set(matrix[j + 12], matrix[j + 13], matrix[j + 14]).project(root.camera).toArray();
          });
        });
        expect(projected).toHaveLength(count);
        for (const point of projected) for (const coordinate of point) expect(Math.abs(coordinate)).toBeLessThan(1);
      }
      const pose = async () => page.evaluate(() => {
        const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
        return [...root.camera.position.toArray(), root.camera.zoom];
      });
      const beforeResize = await pose();
      await page.setViewportSize({ width: 1440, height: 900 });
      await waitForSceneIdle(page);
      (await pose()).forEach((value, i) => expect(value).toBeCloseTo(beforeResize[i], 5));
      await page.setViewportSize({ width: 375, height: 812 });
      await waitForSceneIdle(page);
    }
  }
  await page.screenshot({ path: ".lavish/system-wide-map-mobile.png" });
});

test("hidden sibling resource links cannot exhaust the selected request's playback capacity", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSystem(page);
  await page.evaluate(async () => {
    const storePath = "/src/state/store.ts", fixturesPath = "/src/test/sceneFixtures.ts", connectionsPath = "/src/engine/connections.ts";
    const { useAppStore } = await import(storePath) as typeof import("../../src/state/store");
    const { sceneModel, sceneLane } = await import(fixturesPath) as typeof import("../../src/test/sceneFixtures");
    const { buildConnections, consumerConnections } = await import(connectionsPath) as typeof import("../../src/engine/connections");
    const requests = Array.from({ length: 513 }, (_, index) => ({ start: index / 1000, end: index / 1000 + 1, url: `https://example.test/${index}`, requesterLane: 0, renderBlocking: false, initiatorType: null }));
    const network = sceneLane(requests.map((request) => ({ start: request.start, dur: request.end - request.start })), 1);
    network.meta.kind = "network";
    const model = sceneModel([sceneLane([{ start: 100, dur: 10 }]), network], 120);
    model.requests = requests;
    model.connections = buildConnections(consumerConnections(
      requests.map((request, idx) => ({ lane: 1, idx, start: request.start, url: request.url })),
      requests.map((request) => ({ lane: 0, idx: 0, start: 100, url: request.url })),
    ));
    useAppStore.setState({ model, hiddenLanes: new Set(), selection: null, brush: null, playhead: 50 });
  });
  await waitForSceneIdle(page);
  const point = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const mesh = root.scene.getObjectByName("system-requests") as InstancedMesh;
    const matrix = mesh.instanceMatrix.array, j = 512 * 16;
    const point = root.camera.position.clone().set(matrix[j + 12], matrix[j + 13] + matrix[j + 5] / 2, matrix[j + 14]).project(root.camera);
    const rect = root.gl.domElement.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.getByRole("complementary", { name: "Selection details", exact: true })).toContainText("https://example.test/512");
  await waitForSceneIdle(page);
  const visible = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const routes = root.scene.getObjectByName("connection-arcs")!;
    const packets = root.scene.getObjectByName("connection-packets") as InstancedMesh;
    return { routes: routes.userData.arcs.length, packets: packets.count, packet: packets.userData.packets[0] };
  });
  expect(visible.routes).toBe(1);
  expect(visible.packets).toBe(1);
  expect(visible.packet).toMatchObject({ kind: "link", instance: 512 });
  await page.screenshot({ path: ".lavish/system-selected-request-capacity.png" });
});
