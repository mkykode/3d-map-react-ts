import { useEffect, useRef, type ComponentRef } from "react";
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useAppStore } from "../state/store";
import { TIME_W } from "./layout";

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

/**
 * Camera presets. Orbit = perspective overview. Top/Side are orthographic and
 * reproduce the familiar 2D charts (flame chart / utilization silhouette).
 * W/A/S/D: zoom and pan along the timeline, mirroring DevTools bindings.
 */
export function CameraRig({ worldDepth }: { worldDepth: number }) {
  const preset = useAppStore((s) => s.preset);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const size = useThree((s) => s.size);

  const center: [number, number, number] = [TIME_W / 2, 0, worldDepth / 2];
  const orbitPos: [number, number, number] = [
    TIME_W * 0.62,
    Math.max(52, worldDepth * 0.85),
    worldDepth + TIME_W * 0.42,
  ];
  const orthoZoomTop = Math.min(
    (size.width * 0.82) / (TIME_W + 20),
    (size.height * 0.82) / (worldDepth + 14),
  );
  const orthoZoomSide = Math.min(
    (size.width * 0.82) / (TIME_W + 20),
    (size.height * 0.6) / 30,
  );

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.target.set(center[0], center[1], center[2]);
    controls.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- center derives from worldDepth
  }, [preset, worldDepth]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const controls = controlsRef.current;
      if (!controls) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const camera = controls.object;
      const key = event.key.toLowerCase();
      const panStep = TIME_W * 0.04;
      if (key === "a" || key === "d") {
        const dx = key === "a" ? -panStep : panStep;
        controls.target.x += dx;
        camera.position.x += dx;
        controls.update();
      } else if (key === "w" || key === "s") {
        const factor = key === "w" ? 0.85 : 1 / 0.85;
        if ("isOrthographicCamera" in camera && camera.isOrthographicCamera) {
          camera.zoom /= factor;
          camera.updateProjectionMatrix();
        } else {
          camera.position.lerpVectors(
            controls.target,
            camera.position,
            factor,
          );
        }
        controls.update();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {preset === "orbit" && (
        <PerspectiveCamera makeDefault fov={50} position={orbitPos} />
      )}
      {preset === "top" && (
        <OrthographicCamera
          makeDefault
          position={[center[0], 120, center[2]]}
          zoom={orthoZoomTop}
          up={[0, 0, -1]}
        />
      )}
      {preset === "side" && (
        <OrthographicCamera
          makeDefault
          position={[center[0], 8, -140]}
          zoom={orthoZoomSide}
          up={[0, 1, 0]}
        />
      )}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={center}
        enableRotate={preset === "orbit"}
        enableDamping
        dampingFactor={0.12}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </>
  );
}
