import { OrthographicCamera } from "three";
import type { CameraControlsHandle } from "./cameraFlight";

export const MIN_CAMERA_ZOOM = 0.25;
export const MAX_CAMERA_ZOOM = 250;

export function clampCameraZoom(zoom: number) {
  return Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, zoom));
}

/** Orbit polar limits alone do not stop a panned target going below ground. */
export function constrainCamera(controls: CameraControlsHandle) {
  const camera = controls.object;
  const minY = 1.5;
  if (camera.position.y < minY) {
    const correction = minY - camera.position.y;
    camera.position.y += correction;
    controls.target.y += correction;
  }
  if (camera instanceof OrthographicCamera) {
    const zoom = Math.max(controls.minZoom, Math.min(controls.maxZoom, camera.zoom));
    if (zoom !== camera.zoom) { camera.zoom = zoom; camera.updateProjectionMatrix(); }
  }
}

/** Clamp before anchor correction so repeated zooms at a limit do not drift. */
export function boundedZoomFactor(controls: CameraControlsHandle, factor: number) {
  const camera = controls.object;
  if (camera instanceof OrthographicCamera) {
    const zoom = Math.max(controls.minZoom, Math.min(controls.maxZoom, camera.zoom / factor));
    return camera.zoom / zoom;
  }
  const distance = camera.position.distanceTo(controls.target);
  if (!distance) return 1;
  return Math.max(controls.minDistance, Math.min(controls.maxDistance, distance * factor)) / distance;
}
