import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useAppStore, useHoverStore } from "../state/store";
import type { SceneDebugHost } from "./diagnostics";

/** Deterministic browser seam for proving demand-rendered scenes stay idle. */
export function RenderActivity({ hostId }: { hostId: string }) {
  const count = useRef(0);
  const gl = useThree((state) => state.gl);
  const get = useThree((state) => state.get);

  useEffect(() => {
    const scene = get().scene;
    const host = gl.domElement.ownerDocument.getElementById(hostId) as SceneDebugHost | null;
    if (host) host.traceScene = get;
    if (host) host.dataset.renderCount = String(count.current);
    if (host) host.dataset.sceneAnimating = "false";
    scene.userData.getAppState = useAppStore.getState;
    scene.userData.getHoverState = useHoverStore.getState;
    return () => { if (host) delete host.traceScene; delete scene.userData.getAppState; delete scene.userData.getHoverState; };
  }, [gl, hostId, get]);

  useFrame(() => {
    count.current += 1;
    const host = gl.domElement.ownerDocument.getElementById(hostId);
    if (host) host.dataset.renderCount = String(count.current);
  });

  return null;
}
