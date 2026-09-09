import { Frustum, Matrix4, Vector3, type Camera } from "three";
import type { Vector3Tuple, WorldBounds } from "./cameraActions";

/** Clip the ground rectangle to all six view planes, including the horizon. */
export function cameraFootprint(camera: Camera, bounds: WorldBounds, side = false): Vector3Tuple[] {
  camera.updateMatrixWorld();
  const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const low = side ? bounds.min[1] : bounds.min[2];
  const high = side ? bounds.max[1] : bounds.max[2];
  const level = side ? (bounds.min[2] + bounds.max[2]) / 2 : Math.min(0, bounds.min[1]);
  let polygon = [[bounds.min[0], low], [bounds.max[0], low], [bounds.max[0], high], [bounds.min[0], high]]
    .map(([x, y]) => side ? new Vector3(x, y, level) : new Vector3(x, level, y));
  for (const plane of frustum.planes) {
    const output: Vector3[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const da = plane.distanceToPoint(a), db = plane.distanceToPoint(b);
      if (da >= 0) output.push(a);
      if ((da >= 0) !== (db >= 0)) output.push(a.clone().lerp(b, da / (da - db)));
    }
    polygon = output;
  }
  return polygon.map((p) => p.toArray());
}
