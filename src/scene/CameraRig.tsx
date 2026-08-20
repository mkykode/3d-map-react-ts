import { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useAppStore } from "../state/store";
import { useReducedMotion } from "../lib/useReducedMotion";
import {
  poseForBounds,
  resolveCameraAction,
  traceSelectionBounds,
  type CameraActionKind,
  type SerializableCameraPose,
  type WorldBounds,
} from "./cameraActions";
import {
  useCameraFlight,
  type CameraControlsHandle,
  type CameraFlightDestination,
} from "./cameraFlight";
import {
  useCameraCommandRuntime,
  useCameraRuntime,
} from "./cameraRuntime";
import { BOX_H, DEPTH_CAP, TIME_W } from "./layout";
import {
  regressionMarkBounds,
  regressionProjectionBounds,
} from "./regressionPicking";

/** Compose camera projections, controls, store state, and runtime controllers. */
export function CameraRig({ worldDepth }: { worldDepth: number }) {
  const preset = useAppStore((state) => state.preset);
  const cameraMode = useAppStore((state) => state.cameraMode);
  const panPlane = useAppStore((state) => state.panPlane);
  const view = useAppStore((state) => state.view);
  const model = useAppStore((state) => state.model);
  const selection = useAppStore((state) => state.selection);
  const hiddenLanes = useAppStore((state) => state.hiddenLanes);
  const regressionProjection = useAppStore(
    (state) => state.analysisRegressionProjection,
  );
  const selectedFindingId = useAppStore(
    (state) => state.analysisScope?.selectedFindingId ?? null,
  );
  const cameraCommand = useAppStore((state) => state.cameraCommand);
  const cameraInput = useAppStore((state) => state.cameraInput);
  const dispatchCameraInput = useAppStore(
    (state) => state.dispatchCameraInput,
  );
  const requestCameraAction = useAppStore(
    (state) => state.requestCameraAction,
  );
  const controlsRef = useRef<CameraControlsHandle | null>(null);
  const [controlsRevision, setControlsRevision] = useState(0);
  const poseRevision = useRef(0);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const reducedMotion = useReducedMotion();
  const maxPolarAngle =
    preset === "top"
      ? Math.PI / 2
      : cameraMode === "strategy"
        ? Math.PI / 2 - 0.02
        : Math.PI - 0.02;
  const maxDistance = cameraMode === "strategy" ? 600 : 900;

  const publishPose = useCallback(
    (
      controls: CameraControlsHandle,
      transitioning = false,
      commit = false,
    ) => {
      const domElement = controls.domElement;
      if (!domElement) return;
      const host =
        domElement.ownerDocument.getElementById("trace-camera") ?? domElement;
      const camera = controls.object;
      const pose: SerializableCameraPose = {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
        zoom: camera instanceof THREE.OrthographicCamera ? camera.zoom : 1,
        projection:
          camera instanceof THREE.OrthographicCamera
            ? "orthographic"
            : "perspective",
        preset,
        mode: cameraMode,
      };
      poseRevision.current += 1;
      host.dataset.cameraPose = JSON.stringify({
        ...pose,
        revision: poseRevision.current,
      });
      host.dataset.cameraPreset = preset;
      host.dataset.cameraMode = cameraMode;
      host.dataset.cameraMaxPolarAngle = String(maxPolarAngle);
      host.dataset.cameraMaxDistance = String(maxDistance);
      host.dataset.cameraWorldDepth = String(worldDepth);
      host.dataset.cameraTransitioning = String(transitioning);
      if (commit) useAppStore.getState().setCameraPose(pose);
    },
    [cameraMode, maxDistance, maxPolarAngle, preset, worldDepth],
  );

  const assignControls = useCallback((controls: CameraControlsHandle | null) => {
    controlsRef.current = controls;
    setControlsRevision((revision) => revision + 1);
  }, []);

  const workspaceBounds = useMemo<WorldBounds>(
    () => view === "diff" && regressionProjection
      ? regressionProjectionBounds(regressionProjection.marks)
      : {
          min: [0, 0, 0],
          max: [TIME_W, DEPTH_CAP * BOX_H + 3, worldDepth],
        },
    [regressionProjection, view, worldDepth],
  );
  const selectedRegressionMark = regressionProjection?.marks.find(
    (mark) => mark.findingId === selectedFindingId,
  );
  const presetPose = useMemo(
    () => poseForBounds(workspaceBounds, preset, size, cameraMode),
    [cameraMode, preset, size, workspaceBounds],
  );
  const center = useMemo(
    () => new THREE.Vector3(...presetPose.target),
    [presetPose.target],
  );
  const flight = useCameraFlight({
    controlsRef,
    preset,
    flightKey: `${preset}-${view}-${worldDepth}-${regressionProjection?.byteLength ?? 0}`,
    presetPose,
    center,
    reducedMotion,
    publishPose,
    invalidate,
  });

  const resolveCommandDestination = useCallback(
    (kind: CameraActionKind): CameraFlightDestination => {
      const traceBounds = model
        ? traceSelectionBounds(model, selection, hiddenLanes)
        : null;
      const selectedBounds = view === "diff" && selectedRegressionMark
        ? regressionMarkBounds(selectedRegressionMark)
        : traceBounds;
      const result = resolveCameraAction(kind, {
        workspace: workspaceBounds,
        selection: selectedBounds,
        preset,
        cameraMode,
        viewport: size,
        selectedFindingId,
      });
      return {
        position: new THREE.Vector3(...result.pose.position),
        target: new THREE.Vector3(...result.pose.target),
        zoom: result.pose.zoom,
      };
    },
    [
      cameraMode,
      hiddenLanes,
      model,
      preset,
      selectedFindingId,
      selectedRegressionMark,
      selection,
      size,
      view,
      workspaceBounds,
    ],
  );

  useCameraCommandRuntime({
    cameraCommand,
    controlsRef,
    controlsRevision,
    resolveDestination: resolveCommandDestination,
    reducedMotion,
    publishPose,
    invalidate,
    flight,
  });
  useCameraRuntime({
    controlsRef,
    controlsRevision,
    preset,
    panPlane,
    cameraInput,
    hasSelection: selection !== null || selectedRegressionMark !== undefined,
    dispatchCameraInput,
    requestAction: requestCameraAction,
    publishPose,
    invalidate,
    flight,
  });

  const { renderedOrthoMode } = flight;
  return (
    <>
      {renderedOrthoMode === null ? (
        <PerspectiveCamera makeDefault fov={50} position={presetPose.position} />
      ) : null}
      {renderedOrthoMode === "top" ? (
        <OrthographicCamera
          makeDefault
          position={presetPose.position}
          zoom={presetPose.zoom}
          up={[0, 0, -1]}
        />
      ) : null}
      {renderedOrthoMode === "side" ? (
        <OrthographicCamera
          makeDefault
          position={presetPose.position}
          zoom={presetPose.zoom}
          up={[0, 1, 0]}
        />
      ) : null}
      <OrbitControls
        key={renderedOrthoMode ?? "perspective"}
        ref={assignControls}
        makeDefault
        target={center}
        enablePan
        enableRotate={preset === "orbit"}
        enableDamping
        zoomToCursor
        dampingFactor={0.12}
        maxPolarAngle={maxPolarAngle}
        maxDistance={maxDistance}
      />
    </>
  );
}
