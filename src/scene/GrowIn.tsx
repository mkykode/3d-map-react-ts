import { useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useReducedMotion } from "../lib/useReducedMotion";

/**
 * Cinematic entrance: the whole scene grows out of the ground plane when its
 * dependency changes. One group transform per frame; cost is independent of
 * how many instances the scene draws.
 */
export function GrowIn({
  children,
  dep,
}: {
  children: ReactNode;
  dep: unknown;
}) {
  const ref = useRef<THREE.Group>(null);
  const progress = useRef(1);
  const reducedMotion = useReducedMotion();
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const host = gl.domElement.ownerDocument.getElementById("trace-camera");
    if (reducedMotion) {
      progress.current = 1;
      if (ref.current) ref.current.scale.y = 1;
      if (host) host.dataset.sceneAnimating = "false";
      return;
    }
    progress.current = 0;
    if (ref.current) ref.current.scale.y = 0.0001;
    if (host) host.dataset.sceneAnimating = "true";
    invalidate();
  }, [dep, gl, invalidate, reducedMotion]);

  useFrame((_, delta) => {
    if (!ref.current || progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + delta / 0.7);
    const eased = 1 - Math.pow(1 - progress.current, 3);
    ref.current.scale.y = Math.max(0.0001, eased);
    if (progress.current < 1) invalidate();
    if (progress.current === 1) {
      const host = gl.domElement.ownerDocument.getElementById("trace-camera");
      if (host) host.dataset.sceneAnimating = "false";
    }
  });

  return <group ref={ref}>{children}</group>;
}
