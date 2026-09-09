import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { poseForBounds, type WorldBounds } from "./cameraActions";

/** Embedded evidence previews use the same fit contract as the main stage. */
export function PreviewCamera({ bounds }: { bounds: WorldBounds }) {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    const { camera, invalidate } = get();
    const pose = poseForBounds(bounds, "orbit", size, "strategy");
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    camera.updateMatrixWorld();
    invalidate();
  }, [bounds, size, get]);
  return null;
}
