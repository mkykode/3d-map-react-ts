import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { SCENE_DEBUG } from "./diagnostics";
import { MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM } from "./cameraLimits";
import { cityBuildingForName, cityBuildings } from "./cityLayout";
import { aggregateSelectionBounds, selectionNameId } from "./traceSelection";
import { CITY_H, scaleHeight } from "./layout";
import { CITY_X } from "./sceneBounds";
import { diffMarkBounds } from "./diffLayout";
import {
  regressionMarkBounds,
} from "./regressionPicking";

/** Compose camera projections, controls, store state, and runtime controllers. */
export function CameraRig({ bounds: workspaceBounds }: { bounds: WorldBounds }) {
  const preset = useAppStore((state) => state.preset);
  const cameraMode = useAppStore((state) => state.cameraMode);
  const panPlane = useAppStore((state) => state.panPlane);
  const view = useAppStore((state) => state.view);
  const model = useAppStore((state) => state.model);
  const selection = useAppStore((state) => state.selection);
  const hiddenLanes = useAppStore((state) => state.hiddenLanes);
  const brush = useAppStore((state) => state.brush);
  const zoomed = useAppStore((state) => state.zoomed);
  const scale = useAppStore((state) => state.scale);
  const regressionProjection = useAppStore(
    (state) => state.analysisRegressionProjection,
  );
  const findingProjection = useAppStore((s) => s.analysisFindingProjection);
  const selectedEvidenceId = useAppStore((s) => s.analysisScope?.selectedEvidenceId ?? null);
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
  const camera = useThree((state) => state.camera);
  const fitSize = useMemo(() => ({ width: Math.max(size.width * 0.65, size.width - 380), height: Math.max(size.height * 0.7, size.height - 120) }), [size]);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    // The timeline occupies the bottom edge; floating panels occupy the left.
    const shiftX = size.width > 900 ? Math.min(80, size.width * 0.06) : 0;
    const shiftY = (Math.min(100, size.height * 0.22) - 16) / 2;
    camera.setViewOffset(size.width, size.height, -shiftX, shiftY, size.width, size.height);
    invalidate();
    return () => { camera.clearViewOffset(); };
  }, [camera, size.width, size.height, invalidate]);
  const reducedMotion = useReducedMotion();
  const maxPolarAngle = preset === "top" ? Math.PI / 2 : Math.PI / 2 - 0.02;
  const maxDistance = cameraMode === "strategy" ? 600 : 900;
  const worldDepth = workspaceBounds.max[2];

  const publishPose = useCallback(
    (
      controls: CameraControlsHandle,
      transitioning = false,
      commit = false,
    ) => {
      if (!SCENE_DEBUG && !commit) return;
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
      if (SCENE_DEBUG) {
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
      host.dataset.cameraBounds = JSON.stringify(workspaceBounds);
      host.dataset.cameraTransitioning = String(transitioning);
      }
      if (commit) useAppStore.getState().setCameraPose(pose);
    },
    [cameraMode, maxDistance, maxPolarAngle, preset, worldDepth, workspaceBounds],
  );

  const assignControls = useCallback((controls: CameraControlsHandle | null) => {
    controlsRef.current = controls;
    setControlsRevision((revision) => revision + 1);
  }, []);

  const selectedRegressionMark = regressionProjection?.marks.find(
    (mark) => mark.findingId === selectedFindingId,
  );
  const presetPose = useMemo(
    () => poseForBounds(workspaceBounds, preset, fitSize, cameraMode),
    [cameraMode, preset, fitSize, workspaceBounds],
  );
  const center = useMemo(
    () => new THREE.Vector3(...presetPose.target),
    [presetPose.target],
  );
  const flight = useCameraFlight({
    controlsRef,
    preset,
    // Only preset, view, or content bounds may fly the camera home. Viewport
    // size and camera mode stay out: a window resize or a mode toggle must
    // never discard the user's navigation.
    flightKey: `${preset}-${view}-${JSON.stringify(workspaceBounds)}`,
    presetPose,
    center,
    reducedMotion,
    publishPose,
    invalidate,
  });

  const resolveCommandDestination = useCallback(
    (kind: CameraActionKind): CameraFlightDestination => {
      const traceBounds = model && view === "canyon"
        ? traceSelectionBounds(model, selection, hiddenLanes, preset, zoomed && brush ? brush : [0, model.rangeMs])
        : null;
      let selectedBounds = view === "diff" && selectedRegressionMark
        ? regressionMarkBounds(selectedRegressionMark)
        : traceBounds;
      if (view === "diff" && !regressionProjection && findingProjection) {
        const mark = findingProjection.marks.find((m) => m.evidenceId === selectedEvidenceId);
        selectedBounds = mark ? diffMarkBounds(mark, [...new Set(findingProjection.marks.map((m) => m.domain))]) : null;
      }
      if (view === "city" && model) {
        const city = cityBuildings(model, hiddenLanes, brush?.[0] ?? 0, brush?.[1] ?? model.rangeMs);
        const building = cityBuildingForName(city, selectionNameId(model, selection));
        selectedBounds = building ? {
          min: [CITY_X + building.rect.x, 0, building.rect.y],
          max: [CITY_X + building.rect.x + building.rect.w, scaleHeight(building.row.self, city.maxSelf, CITY_H, scale), building.rect.y + building.rect.h],
        } : null;
      }
      if (model && (view === "terrain" || view === "rhythm")) selectedBounds = aggregateSelectionBounds(model, selection, hiddenLanes, view, view === "terrain" && brush ? brush : [0, model.rangeMs]);
      const result = resolveCameraAction(kind, {
        workspace: workspaceBounds,
        selection: selectedBounds,
        preset,
        cameraMode,
        viewport: fitSize,
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
      fitSize,
      findingProjection,
      regressionProjection,
      selectedEvidenceId,
      view,
      workspaceBounds,
      brush,
      zoomed,
      scale,
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
        <PerspectiveCamera makeDefault fov={50} near={1} far={4000} position={presetPose.position} />
      ) : null}
      {renderedOrthoMode === "top" ? (
        <OrthographicCamera
          makeDefault
          near={1}
          far={4000}
          position={presetPose.position}
          zoom={presetPose.zoom}
          up={[0, 0, -1]}
        />
      ) : null}
      {renderedOrthoMode === "side" ? (
        <OrthographicCamera
          makeDefault
          near={1}
          far={4000}
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
        minDistance={6}
        minZoom={MIN_CAMERA_ZOOM}
        maxZoom={MAX_CAMERA_ZOOM}
      />
    </>
  );
}
