import { Box3, DynamicDrawUsage, Sphere, Vector3, type InstancedMesh } from "three";
import type { WorldBounds } from "./cameraActions";

export function uploadInstances(mesh: InstancedMesh, count: number, bounds: WorldBounds) {
  mesh.count = count;
  for (const [attribute, stride] of [[mesh.instanceMatrix, 16], [mesh.instanceColor, 3]] as const) {
    if (!attribute) continue;
    attribute.setUsage(DynamicDrawUsage);
    attribute.clearUpdateRanges();
    if (count) attribute.addUpdateRange(0, count * stride);
    attribute.needsUpdate = true;
  }
  mesh.boundingBox = new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max));
  mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new Sphere());
}

/** Translation/scale only. Avoid Object3D matrix updates per instance. */
export function writeBox(mesh: InstancedMesh, index: number, x: number, y: number, z: number, w: number, h: number, d: number) {
  const a = mesh.instanceMatrix.array;
  const offset = index * 16;
  a[offset] = w; a[offset + 5] = h; a[offset + 10] = d;
  a[offset + 12] = x; a[offset + 13] = y; a[offset + 14] = z; a[offset + 15] = 1;
}
