import { expect, type Page } from "@playwright/test";
import type { InstancedMesh, Object3D } from "three";
import type { SceneDebugHost } from "../../src/scene/diagnostics";

/** Camera landing and the toolbar ResizeObserver must both finish before probing pixels. */
export async function waitForSceneIdle(page: Page) {
  await expect(page.locator("#trace-camera")).toHaveAttribute("data-camera-transitioning", "false");
  await expect.poll(async () => {
    const before = await page.locator("#trace-camera").getAttribute("data-render-count");
    await page.waitForTimeout(200);
    return before === await page.locator("#trace-camera").getAttribute("data-render-count");
  }).toBe(true);
}

export async function visibleEventPoints(page: Page, laneId: number, preset: string, aggregate = false) {
  return page.evaluate(({ laneId, preset, aggregate }) => {
    const host = document.getElementById("trace-camera") as SceneDebugHost;
    const root = host.traceScene!();
    const mesh = root.scene.getObjectByName(`canyon-lane-${laneId}`) as InstancedMesh;
    if (!mesh) return [];
    const colliders: Object3D[] = [];
    root.scene.traverse((object) => { if (object.name.startsWith("pick-lane-")) colliders.push(object); });
    const rect = root.gl.domElement.getBoundingClientRect();
    const points: { x: number; y: number; idx: number; count: number }[] = [];
    mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < mesh.count && points.length < 5; i++) {
      const count = mesh.userData.sourceCounts[i] as number;
      if (aggregate ? count <= 1 : count !== 1) continue;
      const a = mesh.instanceMatrix.array, offset = i * 16;
      const center = root.camera.position.clone().set(a[offset + 12], a[offset + 13] + (preset === "side" ? 0 : a[offset + 5] / 2), a[offset + 14] + (preset === "side" ? a[offset + 10] / 2 : 0));
      const projected = center.clone().applyMatrix4(mesh.matrixWorld).project(root.camera);
      const end = center.clone().add({ x: a[offset] / 2, y: 0, z: 0 }).applyMatrix4(mesh.matrixWorld).project(root.camera);
      if (!aggregate && Math.abs(end.x - projected.x) * rect.width < 3) continue;
      const x = rect.left + (projected.x + 1) / 2 * rect.width, y = rect.top + (1 - projected.y) / 2 * rect.height;
      if (document.elementFromPoint(x, y) !== root.gl.domElement) continue;
      root.raycaster.setFromCamera(root.pointer.clone().set(projected.x, projected.y), root.camera);
      const hit = root.raycaster.intersectObjects(colliders, false)[0];
      if (hit?.object.name !== `pick-lane-${laneId}` || hit.instanceId !== i) continue;
      points.push({ x, y, idx: mesh.userData.sourceIndices[i], count });
    }
    return points;
  }, { laneId, preset, aggregate });
}

export async function baseBufferVersions(page: Page) {
  return page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    const versions: Record<string, [number, number]> = {};
    root.scene.traverse((object) => {
      if (object.name.startsWith("canyon-lane-")) {
        const mesh = object as InstancedMesh;
        versions[object.name] = [mesh.instanceMatrix.version, mesh.instanceColor!.version];
      }
    });
    return versions;
  });
}
