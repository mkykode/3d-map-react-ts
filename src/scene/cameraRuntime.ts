import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { boundedZoomFactor, constrainCamera } from "./cameraLimits";
import { SCENE_DEBUG } from "./diagnostics";
import { useHoverStore } from "../state/store";
import {
  cameraInputForKeyboard,
  type CameraActionKind,
  type CameraActionPreset,
  type CameraControlMode,
  type CameraInputCommand,
} from "./cameraActions";
import type { PanPlane } from "./cameraNavigation";
import {
  anchorCameraAtScreenPoint,
  panCameraByPixels,
  panOffsetForPlane,
  WheelGestureClassifier,
  worldPointAtScreenFocus,
  zoomCameraAtScreenPoint,
  zoomFactorForWheel,
  type WheelGestureDecision,
} from "./cameraNavigation";
import { TIME_W } from "./layout";
import type {
  CameraControlsHandle,
  CameraFlightController,
  CameraFlightDestination,
} from "./cameraFlight";

export type PendingNavigation =
  | { kind: "pan"; direction: THREE.Vector3 }
  | { kind: "panPixels"; deltaX: number; deltaY: number }
  | { kind: "zoom"; factor: number; focusX: number; focusY: number };

export function useCameraCommandRuntime(options: {
  cameraCommand: { id: number; kind: CameraActionKind };
  controlsRef: RefObject<CameraControlsHandle | null>;
  controlsRevision: number;
  resolveDestination: (kind: CameraActionKind) => CameraFlightDestination;
  reducedMotion: boolean;
  publishPose: (
    controls: CameraControlsHandle,
    transitioning?: boolean,
    commit?: boolean,
  ) => void;
  invalidate: () => void;
  flight: CameraFlightController;
}): void {
  const handledCameraCommand = useRef(0);
  const {
    cameraCommand,
    controlsRef,
    controlsRevision,
    resolveDestination,
    reducedMotion,
    publishPose,
    invalidate,
    flight,
  } = options;
  const { cancel, start } = flight;

  useEffect(() => {
    if (
      cameraCommand.id === 0 ||
      cameraCommand.id === handledCameraCommand.current
    ) {
      return;
    }
    const controls = controlsRef.current;
    if (!controls) return;
    handledCameraCommand.current = cameraCommand.id;
    const destination = resolveDestination(cameraCommand.kind);
    useHoverStore.getState().setHover(null);
    const host = controls.domElement?.ownerDocument.getElementById("trace-camera");
    if (SCENE_DEBUG && host) host.dataset.cameraAction = cameraCommand.kind;
    if (reducedMotion) {
      controls.object.position.copy(destination.position);
      controls.target.copy(destination.target);
      if (controls.object instanceof THREE.OrthographicCamera) {
        controls.object.zoom = destination.zoom ?? controls.object.zoom;
        controls.object.updateProjectionMatrix();
      }
      controls.update();
      cancel();
      publishPose(controls, false, true);
      invalidate();
      return;
    }
    start(destination);
  }, [
    cameraCommand,
    cancel,
    controlsRef,
    controlsRevision,
    invalidate,
    publishPose,
    reducedMotion,
    resolveDestination,
    start,
  ]);
}

export function useCameraRuntime(options: {
  controlsRef: RefObject<CameraControlsHandle | null>;
  controlsRevision: number;
  preset: CameraActionPreset;
  cameraMode: CameraControlMode;
  panPlane: PanPlane;
  cameraInput: { id: number; command: CameraInputCommand } | null;
  hasSelection: boolean;
  dispatchCameraInput: (command: CameraInputCommand) => void;
  requestAction: (action: CameraActionKind) => void;
  publishPose: (
    controls: CameraControlsHandle,
    transitioning?: boolean,
    commit?: boolean,
  ) => void;
  invalidate: () => void;
  flight: CameraFlightController;
}): void {
  const {
    controlsRef,
    controlsRevision,
    preset,
    cameraMode,
    panPlane,
    cameraInput,
    hasSelection,
    dispatchCameraInput,
    requestAction,
    publishPose,
    invalidate,
    flight,
  } = options;
  const {
    cancel,
    finishCameraSwap,
    isFlying,
    isTransitioning,
    land,
  } = flight;
  const pendingNavigation = useRef<PendingNavigation[]>([]);

  useEffect(() => {
    const controls = controlsRef.current;
    const domElement = controls?.domElement;
    if (!controls || !domElement) return;
    const isOrbit = preset === "orbit";
    controls.mouseButtons = {
      LEFT: isOrbit ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = {
      ONE: isOrbit ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    controls.screenSpacePanning = !isOrbit;
    applyPendingNavigation(controls, pendingNavigation.current);
    pendingNavigation.current = [];
    finishCameraSwap();
    controls.update();
    constrainCamera(controls, cameraMode);
    publishPose(controls, false, true);

    const cancelFlight = () => {
      useHoverStore.getState().setHover(null);
      if (!land(controls)) cancel();
    };
    const applyWheel = (
      decision: WheelGestureDecision,
      focusX: number,
      focusY: number,
    ) => {
      const gestureHost =
        domElement.ownerDocument.getElementById("trace-camera") ?? domElement;
      if (SCENE_DEBUG) {
      gestureHost.dataset.cameraLastWheelDecision = decision.gesture;
      gestureHost.dataset.cameraLastWheelDeltaX = String(decision.deltaX);
      gestureHost.dataset.cameraLastWheelDeltaY = String(decision.deltaY);
      }
      const isLanding = isTransitioning() && preset !== "orbit";

      if (decision.gesture === "zoom") {
        const factor = Math.pow(
          zoomFactorForWheel(decision.deltaY, controls.zoomSpeed),
          decision.wheelSteps ?? 1,
        );
        const camera = controls.object;
        if (!isLanding) {
          if (
            camera instanceof THREE.PerspectiveCamera ||
            camera instanceof THREE.OrthographicCamera
          ) {
            cancel();
            const anchor = zoomCameraAtScreenPoint(
              camera,
              controls.target,
              domElement.clientWidth,
              domElement.clientHeight,
              focusX,
              focusY,
              boundedZoomFactor(controls, factor),
            );
            controls.update();
            publishFocusError(domElement, camera, anchor, focusX, focusY);
            publishPose(controls, false, true);
          }
          return;
        }
        pendingNavigation.current.push({
          kind: "zoom",
          factor,
          focusX,
          focusY,
        });
        if (isFlying()) land(controls);
        return;
      }

      if (SCENE_DEBUG) {
        gestureHost.dataset.cameraLastPanDeltaX = String(decision.deltaX);
        gestureHost.dataset.cameraLastPanDeltaY = String(decision.deltaY);
      }
      if (isLanding) {
        pendingNavigation.current.push({
          kind: "panPixels",
          deltaX: decision.deltaX,
          deltaY: decision.deltaY,
        });
        if (isFlying()) land(controls);
        return;
      }

      const camera = controls.object;
      if (
        !(camera instanceof THREE.PerspectiveCamera) &&
        !(camera instanceof THREE.OrthographicCamera)
      ) {
        return;
      }
      cancel();
      panCameraByPixels(
        camera,
        controls.target,
        domElement.clientWidth,
        domElement.clientHeight,
        decision.deltaX,
        decision.deltaY,
      );
      controls.update();
      publishPose(controls, false, true);
    };
    const onChange = () => {
      if (useHoverStore.getState().hover) useHoverStore.getState().setHover(null);
      constrainCamera(controls, cameraMode);
      publishPose(controls, isFlying());
      invalidate();
    };
    const onEnd = () => publishPose(controls, false, true);
    const unbindWheel = bindWheelInput(domElement, applyWheel);
    const unbindTouch = bindTouchFocusAnchor({
      controls,
      domElement,
      publish: () => publishPose(controls, false, true),
    });
    controls.addEventListener("start", cancelFlight);
    controls.addEventListener("change", onChange);
    controls.addEventListener("end", onEnd);
    return () => {
      controls.removeEventListener("start", cancelFlight);
      controls.removeEventListener("change", onChange);
      controls.removeEventListener("end", onEnd);
      unbindWheel();
      unbindTouch();
    };
  }, [
    cancel,
    controlsRef,
    controlsRevision,
    finishCameraSwap,
    invalidate,
    isFlying,
    isTransitioning,
    land,
    preset,
    cameraMode,
    publishPose,
  ]);

  const handledCameraInput = useRef(0);
  const heldKeys = useRef(new Map<string, { command: CameraInputCommand; down: boolean; velocity: number }>());
  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || heldKeys.current.size === 0) return;
    for (const [key, held] of heldKeys.current) {
      const dt = Math.min(delta, 0.05);
      held.velocity = THREE.MathUtils.damp(held.velocity, held.down ? 1 : 0, 18, dt);
      if (!held.down && held.velocity < 0.01) { heldKeys.current.delete(key); continue; }
      const amount = dt * 8 * held.velocity;
      const command = held.command;
      if (command.kind === "action") continue;
      const scaled: CameraInputCommand = command.kind === "pan" ? { ...command, multiplier: command.multiplier * amount }
        : command.kind === "rotate" ? { ...command, angle: command.angle * amount }
        : { ...command, factor: Math.pow(command.factor, amount) };
      applyCameraInput({ controls, command: scaled, panPlane, preset, cameraMode, transitioning: isTransitioning(), hasSelection,
        queue: (operation) => pendingNavigation.current.push(operation), land: () => { if (isFlying()) land(controls); }, cancelFlight: cancel, requestAction });
    }
    if (heldKeys.current.size) { publishPose(controls); invalidate(); }
    else publishPose(controls, false, true);
  });
  useEffect(() => {
    if (!cameraInput || cameraInput.id === handledCameraInput.current) return;
    const controls = controlsRef.current;
    const domElement = controls?.domElement;
    if (!controls || !domElement) return;
    handledCameraInput.current = cameraInput.id;
    const result = applyCameraInput({
      controls,
      command: cameraInput.command,
      panPlane,
      preset,
      cameraMode,
      transitioning: isTransitioning(),
      hasSelection,
      queue: (operation) => pendingNavigation.current.push(operation),
      land: () => {
        if (isFlying()) land(controls);
      },
      cancelFlight: cancel,
      requestAction,
    });
    if (result === "applied") {
      publishPose(controls, false, true);
      invalidate();
    }
  }, [
    cameraInput,
    cancel,
    controlsRef,
    controlsRevision,
    hasSelection,
    invalidate,
    isFlying,
    isTransitioning,
    land,
    panPlane,
    preset,
    cameraMode,
    publishPose,
    requestAction,
  ]);

  useEffect(() => {
    const domElement = controlsRef.current?.domElement;
    if (!domElement) return;
    const keyElement =
      domElement.ownerDocument.getElementById("trace-camera") ?? domElement;
    return bindCameraKeyboard(keyElement, dispatchCameraInput, (key, command) => {
      const previous = heldKeys.current.get(key);
      if (command) heldKeys.current.set(key, { command, down: true, velocity: previous?.velocity ?? 0 });
      else if (previous) previous.down = false;
      invalidate();
    }, () => { heldKeys.current.clear(); });
  }, [controlsRef, controlsRevision, dispatchCameraInput, invalidate]);
}

export function applyCameraInput(options: {
  controls: CameraControlsHandle;
  command: CameraInputCommand;
  panPlane: PanPlane;
  preset: CameraActionPreset;
  cameraMode: CameraControlMode;
  transitioning: boolean;
  hasSelection: boolean;
  queue: (operation: PendingNavigation) => void;
  land: () => void;
  cancelFlight: () => void;
  requestAction: (action: "fit-all" | "fit-selection" | "reset") => void;
}): "applied" | "queued" | "ignored" | "action" {
  const { controls, command } = options;
  if (command.kind === "action") {
    if (command.action === "fit-selection" && !options.hasSelection) {
      return "ignored";
    }
    options.requestAction(command.action);
    return "action";
  }

  const camera = controls.object;
  const domElement = controls.domElement;
  if (!domElement) return "ignored";
  const isOrtho = camera instanceof THREE.OrthographicCamera;
  if (command.kind === "pan") {
    const direction = new THREE.Vector3(
      ...panOffsetForPlane(
        options.panPlane,
        command.horizontal * command.multiplier,
        command.vertical * command.multiplier,
      ),
    );
    if (options.transitioning && options.preset !== "orbit") {
      options.queue({ kind: "pan", direction });
      options.land();
      return "queued";
    }
    options.cancelFlight();
    const step = isOrtho
      ? (TIME_W / camera.zoom) * 0.9
      : camera.position.distanceTo(controls.target) * 0.055;
    const offset = direction.multiplyScalar(step);
    controls.target.add(offset);
    camera.position.add(offset);
  } else if (command.kind === "rotate") {
    if (options.preset !== "orbit") return "ignored";
    options.cancelFlight();
    camera.updateMatrix();
    const axis =
      command.axis === "yaw"
        ? camera.up.clone().normalize()
        : new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).normalize();
    const offset = camera.position
      .clone()
      .sub(controls.target)
      .applyAxisAngle(axis, command.angle);
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
  } else {
    if (options.transitioning && options.preset !== "orbit") {
      options.queue({
        kind: "zoom",
        factor: command.factor,
        focusX: domElement.clientWidth / 2,
        focusY: domElement.clientHeight / 2,
      });
      options.land();
      return "queued";
    }
    options.cancelFlight();
    if (
      camera instanceof THREE.PerspectiveCamera ||
      camera instanceof THREE.OrthographicCamera
    ) {
      zoomCameraAtScreenPoint(
        camera,
        controls.target,
        domElement.clientWidth,
        domElement.clientHeight,
        domElement.clientWidth / 2,
        domElement.clientHeight / 2,
        boundedZoomFactor(controls, command.factor),
      );
    }
  }
  controls.update();
  constrainCamera(controls, options.cameraMode);
  return "applied";
}

export function bindWheelInput(
  domElement: HTMLElement,
  apply: (
    decision: WheelGestureDecision,
    focusX: number,
    focusY: number,
  ) => void,
): () => void {
  const classifier = new WheelGestureClassifier();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let focus = { x: 0, y: 0 };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const bounds = domElement.getBoundingClientRect();
    focus = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const decision = classifier.observe(event);
    if (timer) clearTimeout(timer);
    timer = null;
    if (decision) {
      apply(decision, focus.x, focus.y);
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      const flushed = classifier.flush();
      if (flushed) apply(flushed, focus.x, focus.y);
    }, 45);
  };
  domElement.addEventListener("wheel", onWheel, {
    capture: true,
    passive: false,
  });
  return () => {
    domElement.removeEventListener("wheel", onWheel, true);
    if (timer) clearTimeout(timer);
  };
}

export function bindTouchFocusAnchor(options: {
  controls: CameraControlsHandle;
  domElement: HTMLElement;
  publish: () => void;
}): () => void {
  const { controls, domElement } = options;
  const points = new Map<number, { x: number; y: number }>();
  let anchor: THREE.Vector3 | null = null;
  let focus = { x: 0, y: 0 };
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return;
    const bounds = domElement.getBoundingClientRect();
    points.set(event.pointerId, {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    if (points.size !== 2) return;
    const [first, second] = [...points.values()];
    focus = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const camera = controls.object;
    if (
      camera instanceof THREE.PerspectiveCamera ||
      camera instanceof THREE.OrthographicCamera
    ) {
      anchor = worldPointAtScreenFocus(
        camera,
        controls.target,
        domElement.clientWidth,
        domElement.clientHeight,
        focus.x,
        focus.y,
      );
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "touch" || !points.has(event.pointerId)) return;
    const bounds = domElement.getBoundingClientRect();
    points.set(event.pointerId, {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    if (points.size === 2) {
      const [first, second] = [...points.values()];
      focus = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    }
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return;
    const completedAnchor = points.size === 2 ? anchor : null;
    points.delete(event.pointerId);
    if (!completedAnchor) return;
    anchor = null;
    queueMicrotask(() => {
      const camera = controls.object;
      const damping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      if (
        camera instanceof THREE.PerspectiveCamera ||
        camera instanceof THREE.OrthographicCamera
      ) {
        anchorCameraAtScreenPoint(
          camera,
          controls.target,
          completedAnchor,
          domElement.clientWidth,
          domElement.clientHeight,
          focus.x,
          focus.y,
        );
        controls.update();
        options.publish();
      }
      controls.enableDamping = damping;
      if (!SCENE_DEBUG) return;
      camera.updateMatrixWorld(true);
      const projected = completedAnchor.clone().project(camera);
      const expectedX = (focus.x / domElement.clientWidth) * 2 - 1;
      const expectedY = 1 - (focus.y / domElement.clientHeight) * 2;
      const error = Math.max(
        Math.abs(projected.x - expectedX),
        Math.abs(projected.y - expectedY),
      );
      const host =
        domElement.ownerDocument.getElementById("trace-camera") ?? domElement;
      host.dataset.cameraTouchFocusX = focus.x.toFixed(3);
      host.dataset.cameraTouchFocusY = focus.y.toFixed(3);
      host.dataset.cameraTouchFocusError =
        error < 1e-9 ? "0" : error.toFixed(9);
    });
  };
  const pointerDocument = domElement.ownerDocument;
  domElement.addEventListener("pointerdown", onPointerDown, true);
  pointerDocument.addEventListener("pointermove", onPointerMove, true);
  pointerDocument.addEventListener("pointerup", onPointerUp, true);
  pointerDocument.addEventListener("pointercancel", onPointerUp, true);
  return () => {
    domElement.removeEventListener("pointerdown", onPointerDown, true);
    pointerDocument.removeEventListener("pointermove", onPointerMove, true);
    pointerDocument.removeEventListener("pointerup", onPointerUp, true);
    pointerDocument.removeEventListener("pointercancel", onPointerUp, true);
  };
}

function applyPendingNavigation(
  controls: CameraControlsHandle,
  operations: readonly PendingNavigation[],
): void {
  const camera = controls.object;
  const domElement = controls.domElement;
  if (!domElement) return;
  for (const operation of operations) {
    if (operation.kind === "pan") {
      const isOrtho = camera instanceof THREE.OrthographicCamera;
      const step = isOrtho
        ? (TIME_W / camera.zoom) * 0.9
        : camera.position.distanceTo(controls.target) * 0.055;
      const offset = operation.direction.multiplyScalar(step);
      controls.target.add(offset);
      camera.position.add(offset);
    } else if (operation.kind === "panPixels") {
      if (
        camera instanceof THREE.PerspectiveCamera ||
        camera instanceof THREE.OrthographicCamera
      ) {
        panCameraByPixels(
          camera,
          controls.target,
          domElement.clientWidth,
          domElement.clientHeight,
          operation.deltaX,
          operation.deltaY,
        );
      }
    } else if (
      camera instanceof THREE.PerspectiveCamera ||
      camera instanceof THREE.OrthographicCamera
    ) {
      zoomCameraAtScreenPoint(
        camera,
        controls.target,
        domElement.clientWidth,
        domElement.clientHeight,
        operation.focusX,
        operation.focusY,
        boundedZoomFactor(controls, operation.factor),
      );
    }
  }
}

function publishFocusError(
  domElement: HTMLElement,
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  anchor: THREE.Vector3,
  focusX: number,
  focusY: number,
): void {
  if (!SCENE_DEBUG) return;
  const projected = anchor.clone().project(camera);
  const expectedX = (focusX / domElement.clientWidth) * 2 - 1;
  const expectedY = 1 - (focusY / domElement.clientHeight) * 2;
  const error = Math.max(
    Math.abs(projected.x - expectedX),
    Math.abs(projected.y - expectedY),
  );
  const host =
    domElement.ownerDocument.getElementById("trace-camera") ?? domElement;
  host.dataset.cameraFocusError = error < 1e-9 ? "0" : error.toFixed(9);
}

function bindCameraKeyboard(
  element: HTMLElement,
  dispatchCameraInput: (command: CameraInputCommand) => void,
  setHeld: (key: string, command: CameraInputCommand | null) => void,
  clearHeld: () => void,
): () => void {
  const onKey = (event: KeyboardEvent) => {
    const command = cameraInputForKeyboard({
      key: event.key,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      target: event.target as HTMLElement | null,
    });
    if (!command) return;
    event.preventDefault();
    if (event.repeat) return;
    dispatchCameraInput(command);
    if (command.kind !== "action") setHeld(event.code || event.key, command);
  };
  const onUp = (event: KeyboardEvent) => setHeld(event.code || event.key, null);
  const onBlur = () => clearHeld();
  element.addEventListener("keydown", onKey);
  element.ownerDocument.addEventListener("keyup", onUp);
  element.addEventListener("blur", onBlur);
  window.addEventListener("blur", onBlur);
  return () => {
    clearHeld();
    element.removeEventListener("keydown", onKey);
    element.ownerDocument.removeEventListener("keyup", onUp);
    element.removeEventListener("blur", onBlur);
    window.removeEventListener("blur", onBlur);
  };
}
