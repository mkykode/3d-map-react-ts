import * as THREE from "three";

export const PAN_PLANES = ["xy", "xz", "yz"] as const;
export type PanPlane = (typeof PAN_PLANES)[number];
type Axis = "x" | "y" | "z";
type WheelGestureInput = Pick<
  WheelEvent,
  "ctrlKey" | "deltaMode" | "deltaX" | "deltaY"
>;
type TimedWheelGestureInput = WheelGestureInput & { timeStamp: number };

export interface WheelGestureDecision {
  gesture: "pan" | "zoom";
  deltaX: number;
  deltaY: number;
  wheelSteps?: number;
}

const PIXEL_DELTA_MODE = 0;
const DISCRETE_WHEEL_DELTA = 50;
const TRACKPAD_BURST_MS = 40;
const TRACKPAD_CONTINUATION_MS = 80;
export const PAN_PLANE_AXES: Record<
  PanPlane,
  readonly [horizontal: Axis, vertical: Axis]
> = {
  xy: ["x", "y"],
  xz: ["x", "z"],
  yz: ["z", "y"],
};

/** Map two-dimensional input onto a selected world-space plane. */
export function panOffsetForPlane(
  plane: PanPlane,
  horizontal: number,
  vertical: number,
): [number, number, number] {
  if (plane === "xy") return [horizontal, vertical, 0];
  if (plane === "xz") return [horizontal, 0, vertical];
  return [0, vertical, horizontal];
}

/** Distinguish continuous trackpad motion from pinch and discrete wheel zoom. */
export function classifyWheelGesture(event: WheelGestureInput): "pan" | "zoom" {
  if (event.ctrlKey || event.deltaMode !== PIXEL_DELTA_MODE) return "zoom";
  if (event.deltaX !== 0) return "pan";
  return Math.abs(event.deltaY) < DISCRETE_WHEEL_DELTA ||
    !Number.isInteger(event.deltaY)
    ? "pan"
    : "zoom";
}

/**
 * Pixel-mode vertical wheel events do not expose their physical source. Delay
 * one event briefly: a burst is trackpad evidence, while an isolated event is
 * the strongest browser-observable evidence of a discrete wheel step.
 */
export class WheelGestureClassifier {
  private pending: TimedWheelGestureInput | null = null;
  private trackpadUntil = Number.NEGATIVE_INFINITY;

  observe(event: TimedWheelGestureInput): WheelGestureDecision | null {
    if (event.ctrlKey || event.deltaMode !== PIXEL_DELTA_MODE) {
      this.pending = null;
      return decision("zoom", event);
    }
    if (event.deltaX !== 0) {
      const combined = combine(this.pending, event);
      this.pending = null;
      this.trackpadUntil = event.timeStamp + TRACKPAD_CONTINUATION_MS;
      return decision("pan", combined);
    }
    if (event.timeStamp <= this.trackpadUntil) {
      return decision("pan", event);
    }
    if (
      this.pending &&
      event.timeStamp - this.pending.timeStamp <= TRACKPAD_BURST_MS
    ) {
      if (isRepeatedWheelStep(this.pending, event)) {
        this.pending = null;
        return { ...decision("zoom", event), wheelSteps: 2 };
      }
      const combined = combine(this.pending, event);
      this.pending = null;
      this.trackpadUntil = event.timeStamp + TRACKPAD_CONTINUATION_MS;
      return decision("pan", combined);
    }
    this.pending = {
      ctrlKey: event.ctrlKey,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      timeStamp: event.timeStamp,
    };
    return null;
  }

  flush(): WheelGestureDecision | null {
    if (!this.pending) return null;
    const pending = this.pending;
    this.pending = null;
    return decision("zoom", pending);
  }
}

function isRepeatedWheelStep(
  left: TimedWheelGestureInput,
  right: TimedWheelGestureInput,
): boolean {
  return (
    left.deltaY !== 0 &&
    left.deltaY === right.deltaY &&
    Number.isInteger(left.deltaY)
  );
}

function combine(
  left: TimedWheelGestureInput | null,
  right: TimedWheelGestureInput,
): TimedWheelGestureInput {
  return {
    ...right,
    deltaX: (left?.deltaX ?? 0) + right.deltaX,
    deltaY: (left?.deltaY ?? 0) + right.deltaY,
  };
}

function decision(
  gesture: WheelGestureDecision["gesture"],
  event: WheelGestureInput,
): WheelGestureDecision {
  return { gesture, deltaX: event.deltaX, deltaY: event.deltaY };
}

/** Match OrbitControls' wheel scale while preserving zoom direction. */
export function zoomFactorForWheel(deltaY: number, zoomSpeed: number): number {
  if (deltaY === 0) return 1;
  const scale = Math.pow(0.95, zoomSpeed);
  return deltaY < 0 ? scale : 1 / scale;
}

/** Zoom while keeping the world point below a screen-space focus stationary. */
export function zoomCameraAtScreenPoint(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  target: THREE.Vector3,
  viewportWidth: number,
  viewportHeight: number,
  focusX: number,
  focusY: number,
  factor: number,
): THREE.Vector3 {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    !Number.isFinite(factor) ||
    factor <= 0
  ) {
    return target.clone();
  }

  camera.updateMatrixWorld(true);
  const focus = screenFocus(viewportWidth, viewportHeight, focusX, focusY);
  const planeNormal = new THREE.Vector3();
  camera.getWorldDirection(planeNormal);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    planeNormal,
    target,
  );
  const anchor = worldPointAtFocus(camera, focus, plane) ?? target.clone();

  if (camera instanceof THREE.OrthographicCamera) {
    camera.zoom /= factor;
    camera.updateProjectionMatrix();
  } else {
    camera.position.lerpVectors(target, camera.position, factor);
  }
  camera.updateMatrixWorld(true);

  const shiftedAnchor = worldPointAtFocus(camera, focus, plane);
  if (shiftedAnchor) {
    const correction = anchor.clone().sub(shiftedAnchor);
    camera.position.add(correction);
    target.add(correction);
    camera.updateMatrixWorld(true);
  }
  return anchor;
}

export function worldPointAtScreenFocus(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  target: THREE.Vector3,
  viewportWidth: number,
  viewportHeight: number,
  focusX: number,
  focusY: number,
): THREE.Vector3 | null {
  if (viewportWidth <= 0 || viewportHeight <= 0) return null;
  camera.updateMatrixWorld(true);
  const normal = new THREE.Vector3();
  camera.getWorldDirection(normal);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, target);
  return worldPointAtFocus(
    camera,
    screenFocus(viewportWidth, viewportHeight, focusX, focusY),
    plane,
  );
}

export function anchorCameraAtScreenPoint(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  target: THREE.Vector3,
  anchor: THREE.Vector3,
  viewportWidth: number,
  viewportHeight: number,
  focusX: number,
  focusY: number,
): void {
  if (viewportWidth <= 0 || viewportHeight <= 0) return;
  camera.updateMatrixWorld(true);
  const normal = new THREE.Vector3();
  camera.getWorldDirection(normal);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, anchor);
  const shifted = worldPointAtFocus(
    camera,
    screenFocus(viewportWidth, viewportHeight, focusX, focusY),
    plane,
  );
  if (!shifted) return;
  const correction = anchor.clone().sub(shifted);
  camera.position.add(correction);
  target.add(correction);
  camera.updateMatrixWorld(true);
}

function screenFocus(
  viewportWidth: number,
  viewportHeight: number,
  focusX: number,
  focusY: number,
): THREE.Vector2 {
  return new THREE.Vector2(
    (focusX / viewportWidth) * 2 - 1,
    1 - (focusY / viewportHeight) * 2,
  );
}

function worldPointAtFocus(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  focus: THREE.Vector2,
  plane: THREE.Plane,
): THREE.Vector3 | null {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(focus, camera);
  return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
}

/** Pan the camera and target together using OrbitControls-compatible pixels. */
export function panCameraByPixels(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  target: THREE.Vector3,
  viewportWidth: number,
  viewportHeight: number,
  deltaX: number,
  deltaY: number,
): void {
  if (viewportWidth <= 0 || viewportHeight <= 0) return;

  camera.updateMatrix();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
  let horizontalDistance: number;
  let verticalDistance: number;

  if (camera instanceof THREE.PerspectiveCamera) {
    const halfHeight =
      camera.position.distanceTo(target) *
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    horizontalDistance = (2 * deltaX * halfHeight) / viewportHeight;
    verticalDistance = (2 * deltaY * halfHeight) / viewportHeight;
  } else {
    horizontalDistance =
      (deltaX * (camera.right - camera.left)) /
      camera.zoom /
      viewportWidth;
    verticalDistance =
      (deltaY * (camera.top - camera.bottom)) /
      camera.zoom /
      viewportHeight;
  }

  const offset = right
    .multiplyScalar(-horizontalDistance)
    .addScaledVector(up, verticalDistance);
  camera.position.add(offset);
  target.add(offset);
}
