import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import type { ParsedTraceModel } from "../engine/types";
import { diffTraces } from "../engine/aggregate";
import { DIVERGING } from "../engine/categories";
import { useAppStore } from "../state/store";
import {
  GROUND,
  INK_MUTED,
  INK_SECONDARY,
  LANE_D,
  LANE_GAP,
  TIME_W,
  scaleHeight,
} from "./layout";

const DIFF_H = 8;
const ZERO_Y = 5;
const dummy = new THREE.Object3D();
const REGRESSION = new THREE.Color(DIVERGING.regression);
const IMPROVEMENT = new THREE.Color(DIVERGING.improvement);

/**
 * V5 Diff Terrain: two traces aligned at navigationStart, subtracted per
 * bucket. Red mountains rise above the neutral plane where B is slower;
 * blue valleys hang below where B is faster.
 */
export function DiffScene({
  model,
  modelB,
}: {
  model: ParsedTraceModel;
  modelB: ParsedTraceModel;
}) {
  const scale = useAppStore((s) => s.scale);
  const grid = useMemo(() => diffTraces(model, modelB), [model, modelB]);
  const bucketW = TIME_W / grid.bucketCount;
  const worldDepth = Math.max(grid.lanes.length * LANE_GAP, LANE_GAP);

  const boxes = useMemo(() => {
    const list: { lane: number; bucket: number; delta: number }[] = [];
    grid.lanes.forEach((lane, laneIndex) => {
      for (let b = 0; b < lane.delta.length; b++) {
        if (Math.abs(lane.delta[b]) > 1e-4) {
          list.push({ lane: laneIndex, bucket: b, delta: lane.delta[b] });
        }
      }
    });
    return list;
  }, [grid]);

  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    boxes.forEach((box, i) => {
      const h = Math.max(
        scaleHeight(Math.abs(box.delta), grid.maxAbsDelta, DIFF_H, scale),
        0.05,
      );
      const up = box.delta > 0;
      dummy.position.set(
        box.bucket * bucketW + bucketW / 2,
        up ? ZERO_Y + h / 2 : ZERO_Y - h / 2,
        box.lane * LANE_GAP,
      );
      dummy.scale.set(bucketW * 0.92, h, LANE_D * 0.9);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, up ? REGRESSION : IMPROVEMENT);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [boxes, grid.maxAbsDelta, scale, bucketW]);

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[TIME_W / 2, -0.06, worldDepth / 2 - LANE_GAP / 2]}
      >
        <planeGeometry args={[TIME_W + 26, worldDepth + 18]} />
        <meshBasicMaterial color={GROUND} />
      </mesh>
      {/* Neutral zero plane: the diverging midpoint is gray, never a hue. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[TIME_W / 2, ZERO_Y, worldDepth / 2 - LANE_GAP / 2]}
      >
        <planeGeometry args={[TIME_W + 8, worldDepth + 8]} />
        <meshBasicMaterial
          color={DIVERGING.neutral}
          transparent
          opacity={0.12}
          side={2}
          depthWrite={false}
        />
      </mesh>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, Math.max(boxes.length, 1)]}
        frustumCulled={false}
      >
        <boxGeometry />
        <meshLambertMaterial />
      </instancedMesh>
      {grid.lanes.map((lane, i) => (
        <Billboard key={lane.name} position={[-3, ZERO_Y, i * LANE_GAP]}>
          <Text fontSize={1.1} color={INK_SECONDARY} anchorX="right">
            {lane.name}
          </Text>
        </Billboard>
      ))}
      <Billboard position={[TIME_W / 2, ZERO_Y + DIFF_H + 3, worldDepth / 2]}>
        <Text fontSize={1.2} color={INK_SECONDARY} anchorX="center">
          up · red = B slower (regression) — down · blue = B faster — aligned at nav start
        </Text>
      </Billboard>
      <Text
        position={[TIME_W + 4, ZERO_Y, worldDepth / 2]}
        fontSize={1}
        color={INK_MUTED}
        anchorX="left"
      >
        0
      </Text>
    </group>
  );
}
