import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FrameInfo } from "../engine/types";
import { STATUS_SERIOUS } from "../engine/categories";
import { TIME_W } from "./layout";

const OK_COLOR = new THREE.Color("#2c3138");
const DROPPED_COLOR = new THREE.Color(STATUS_SERIOUS);
const dummy = new THREE.Object3D();

/**
 * One tile per compositor frame along the front edge; dropped frames crack
 * red (status color, reinforced by the legend, never a series hue).
 */
export function FrameFloor({
  frames,
  t0,
  t1,
  z,
}: {
  frames: FrameInfo[];
  t0: number;
  t1: number;
  z: number;
}) {
  const visible = useMemo(
    () => frames.filter((f) => f.end >= t0 && f.start <= t1),
    [frames, t0, t1],
  );
  const ref = useRef<THREE.InstancedMesh>(null);
  const range = t1 - t0;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    visible.forEach((frame, i) => {
      const x0 = (Math.max(frame.start - t0, 0) / range) * TIME_W;
      const x1 = (Math.min(frame.end - t0, range) / range) * TIME_W;
      const w = Math.max(x1 - x0, 0.05);
      dummy.position.set(x0 + w / 2, 0.06, z);
      dummy.scale.set(Math.max(w - 0.06, 0.03), 0.12, 1.6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, frame.dropped ? DROPPED_COLOR : OK_COLOR);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [visible, range, t0, z]);

  if (visible.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, visible.length]}
      frustumCulled={false}
    >
      <boxGeometry />
      <meshBasicMaterial />
    </instancedMesh>
  );
}
