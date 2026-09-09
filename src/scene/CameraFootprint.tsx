import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { WorldBounds } from "./cameraActions";
import { cameraFootprint } from "./viewportFootprint";
import { useSceneViewport } from "./viewportState";
import type { CameraControlsHandle } from "./cameraFlight";

export function CameraFootprint({ bounds, side }: { bounds: WorldBounds; side: boolean }) {
  const last = useRef("");
  useFrame(({ camera, controls }) => {
    const footprint = cameraFootprint(camera, bounds, side);
    const position = camera.position.toArray();
    const target = (controls as CameraControlsHandle | null)?.target.toArray() ?? null;
    const signature = `${side}:${[...position, ...(target ?? []), ...footprint.flat()].map((n) => n.toFixed(2)).join(",")}:${bounds.min.join(",")}:${bounds.max.join(",")}`;
    if (signature === last.current) return;
    last.current = signature;
    useSceneViewport.setState({ footprint, bounds, side, position, target });
  });
  return null;
}
