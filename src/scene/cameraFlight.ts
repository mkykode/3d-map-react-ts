import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentRef,
  type RefObject,
} from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { easing } from "maath";
import * as THREE from "three";
import type {
  CameraActionPreset,
  SerializableCameraPose,
} from "./cameraActions";

export type CameraControlsHandle = ComponentRef<typeof OrbitControls>;
export interface CameraFlightDestination {
  position: THREE.Vector3;
  target: THREE.Vector3;
  zoom?: number;
}

export interface CameraFlightController {
  renderedOrthoMode: "top" | "side" | null;
  start: (destination: CameraFlightDestination) => void;
  cancel: () => void;
  land: (controls: CameraControlsHandle) => boolean;
  finishCameraSwap: () => void;
  isFlying: () => boolean;
  isTransitioning: () => boolean;
}

export function cameraLandingOutcome(
  preset: CameraActionPreset,
  activeOrtho: "top" | "side" | null,
): "swap" | "settled" {
  return preset !== "orbit" && activeOrtho !== preset ? "swap" : "settled";
}

export function useCameraFlight(options: {
  controlsRef: RefObject<CameraControlsHandle | null>;
  preset: CameraActionPreset;
  flightKey: string;
  presetPose: SerializableCameraPose;
  center: THREE.Vector3;
  reducedMotion: boolean;
  publishPose: (
    controls: CameraControlsHandle,
    transitioning?: boolean,
    commit?: boolean,
  ) => void;
  invalidate: () => void;
}): CameraFlightController {
  const {
    controlsRef,
    preset,
    flightKey,
    presetPose,
    center,
    reducedMotion,
    publishPose,
    invalidate,
  } = options;
  const [orthoMode, setOrthoMode] = useState<"top" | "side" | null>(null);
  const size = useThree((s) => s.size);
  const renderedOrthoMode =
    reducedMotion && preset !== "orbit" ? preset : orthoMode;
  const destination = useRef<CameraFlightDestination | null>(null);
  const landingPending = useRef(false);
  const lastPose = useRef(new THREE.Vector3());
  const hasPose = useRef(false);
  const seedPending = useRef(false);

  const [previousFlightKey, setPreviousFlightKey] = useState("");
  if (previousFlightKey !== flightKey) {
    setPreviousFlightKey(flightKey);
    setOrthoMode(null);
  }

  const start = useCallback(
    (next: CameraFlightDestination) => {
      destination.current = next;
      const controls = controlsRef.current;
      if (controls) publishPose(controls, true);
      invalidate();
    },
    [controlsRef, invalidate, publishPose],
  );

  const cancel = useCallback(() => {
    destination.current = null;
  }, []);

  const finishCameraSwap = useCallback(() => {
    landingPending.current = false;
  }, []);

  const isFlying = useCallback(() => destination.current !== null, []);
  const isTransitioning = useCallback(
    () => destination.current !== null || landingPending.current,
    [],
  );

  const land = useCallback(
    (controls: CameraControlsHandle): boolean => {
      const next = destination.current;
      if (!next || preset === "orbit") return false;
      controls.object.position.copy(next.position);
      controls.target.copy(next.target);
      controls.update();
      destination.current = null;
      if (cameraLandingOutcome(preset, renderedOrthoMode) === "swap") {
        landingPending.current = true;
        publishPose(controls, true);
        setOrthoMode(preset);
      } else {
        landingPending.current = false;
        publishPose(controls, false, true);
      }
      return true;
    },
    [preset, publishPose, renderedOrthoMode],
  );

  useLayoutEffect(() => {
    seedPending.current = true;
  }, [flightKey, renderedOrthoMode]);

  useEffect(() => {
    const position = new THREE.Vector3(...presetPose.position);
    const controls = controlsRef.current;
    if (reducedMotion) {
      destination.current = null;
      if (preset === "top" || preset === "side") {
        landingPending.current = false;
      } else if (controls) {
        controls.object.position.copy(position);
        controls.target.copy(center);
        controls.update();
        publishPose(controls, false, true);
        invalidate();
      }
      return;
    }
    destination.current = {
      position,
      target: center.clone(),
      zoom: presetPose.zoom,
    };
    if (controls) publishPose(controls, true);
    invalidate();
    // center and presetPose are derived from flightKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightKey]);

  useFrame((state, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object;

    if (seedPending.current) {
      seedPending.current = false;
      if (hasPose.current && destination.current) {
        camera.position.copy(lastPose.current);
        controls.update();
      }
    }

    const next = destination.current;
    if (next) {
      easing.damp3(camera.position, next.position, 0.32, delta);
      easing.damp3(controls.target, next.target, 0.32, delta);
      let fovSettled = true;
      if (camera instanceof THREE.PerspectiveCamera) {
        // Match the destination's target-plane scale before changing projection.
        const targetFov = preset === "orbit" ? 50 : THREE.MathUtils.radToDeg(2 * Math.atan(size.height / (next.zoom ?? 1) / (2 * next.position.distanceTo(next.target))));
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 10, Math.min(delta, 0.05));
        fovSettled = Math.abs(camera.fov - targetFov) < 0.01;
        camera.updateProjectionMatrix();
      }
      if (
        next.zoom !== undefined &&
        camera instanceof THREE.OrthographicCamera
      ) {
        camera.zoom = THREE.MathUtils.damp(camera.zoom, next.zoom, 8, delta);
        camera.updateProjectionMatrix();
      }
      controls.update();
      const landed =
        fovSettled &&
        camera.position.distanceTo(next.position) < 0.4 &&
        controls.target.distanceTo(next.target) < 0.4 &&
        (next.zoom === undefined ||
          !(camera instanceof THREE.OrthographicCamera) ||
          Math.abs(camera.zoom - next.zoom) < 0.01);
      if (landed) {
        camera.position.copy(next.position);
        controls.target.copy(next.target);
        if (
          next.zoom !== undefined &&
          camera instanceof THREE.OrthographicCamera
        ) {
          camera.zoom = next.zoom;
          camera.updateProjectionMatrix();
        }
        controls.update();
        destination.current = null;
        if (cameraLandingOutcome(preset, renderedOrthoMode) === "swap") {
          landingPending.current = true;
          setOrthoMode(preset === "orbit" ? null : preset);
        } else {
          landingPending.current = false;
          publishPose(controls, false, true);
        }
      } else {
        publishPose(controls, true);
        state.invalidate();
      }
    }

    lastPose.current.copy(camera.position);
    hasPose.current = true;
  });

  return {
    renderedOrthoMode,
    start,
    cancel,
    land,
    finishCameraSwap,
    isFlying,
    isTransitioning,
  };
}
