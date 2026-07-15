import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ColumnarLane, ParsedTraceModel } from "../engine/types";
import { STATUS_SERIOUS } from "../engine/categories";
import { useAppStore, useHoverStore, type Selection } from "../state/store";
import { buildPickIndex, pickEntry } from "./picking";
import {
  BOX_H,
  CAT_COLORS,
  DEPTH_CAP,
  DIM_TARGET,
  INK_SECONDARY,
  LANE_D,
  LANE_GAP,
  TIME_W,
  laneZ,
  msOf,
  xOf,
} from "./layout";
import { FlowArcs } from "./FlowArcs";
import { TimeRuler } from "./TimeRuler";
import { VitalsBeacons } from "./VitalsBeacons";

const LONG_TASK_MS = 50;
const LONG_TASK_TINT = new THREE.Color(STATUS_SERIOUS);
const dummy = new THREE.Object3D();
const color = new THREE.Color();

/**
 * V1 Flame Canyon: X = time, Y = stack depth, Z = one lane per thread.
 * Top orthographic view collapses to the classic flame chart.
 */
export function CanyonScene({ model }: { model: ParsedTraceModel }) {
  const brush = useAppStore((s) => s.brush);
  const selection = useAppStore((s) => s.selection);

  return (
    <group>
      <TimeRuler rangeMs={model.rangeMs} depth={model.lanes.length * LANE_GAP} />
      <VitalsBeacons
        markers={model.markers}
        rangeMs={model.rangeMs}
        depth={model.lanes.length * LANE_GAP}
        height={DEPTH_CAP * BOX_H + 3}
      />
      {model.lanes.map((lane) => (
        <group key={lane.meta.id} position={[0, 0, laneZ(lane.meta.id)]}>
          <LaneBoxes
            lane={lane}
            rangeMs={model.rangeMs}
            brush={brush}
            selection={selection}
          />
          <LaneHitbox lane={lane} rangeMs={model.rangeMs} />
          <Billboard position={[-3, 1.2, 0]}>
            <Text
              fontSize={1.1}
              color={INK_SECONDARY}
              anchorX="right"
              anchorY="middle"
            >
              {lane.meta.name}
            </Text>
          </Billboard>
        </group>
      ))}
      <FlowArcs model={model} />
    </group>
  );
}

function LaneBoxes({
  lane,
  rangeMs,
  brush,
  selection,
}: {
  lane: ColumnarLane;
  rangeMs: number;
  brush: [number, number] | null;
  selection: Selection | null;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = lane.starts.length;
  const minWidthMs = rangeMs * 0.0004;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const { starts, durs, depths, catIds, nameIds } = lane;

    for (let i = 0; i < count; i++) {
      const start = starts[i];
      const durMs = Math.max(durs[i], minWidthMs);
      const w = Math.max((durMs / rangeMs) * TIME_W, 0.015);
      const depth = Math.min(depths[i], DEPTH_CAP);

      dummy.position.set(xOf(start, rangeMs) + w / 2, depth * BOX_H + BOX_H / 2, 0);
      dummy.scale.set(Math.max(w - 0.02, 0.01), BOX_H * 0.88, LANE_D * 0.9);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      color.copy(CAT_COLORS[catIds[i]]);
      // Long tasks: top-level work over 50 ms carries a status tint.
      if (depths[i] === 0 && durs[i] >= LONG_TASK_MS) {
        color.lerp(LONG_TASK_TINT, 0.45);
      }
      const outsideBrush =
        brush !== null && (start + durs[i] < brush[0] || start > brush[1]);
      const dimmedBySelection =
        selection?.kind === "name" && nameIds[i] !== selection.nameId;
      if (outsideBrush || dimmedBySelection) {
        color.lerp(DIM_TARGET, 0.78);
      } else if (
        selection?.kind === "entry" &&
        selection.lane === lane.meta.id &&
        selection.idx === i
      ) {
        color.lerp(new THREE.Color("#ffffff"), 0.35);
      }
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [lane, rangeMs, brush, selection, count, minWidthMs]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      <boxGeometry />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

/**
 * Invisible slab per lane: R3F raycasts one box, and we resolve the exact
 * entry analytically from the hit point (no per-event raycasting).
 */
function LaneHitbox({
  lane,
  rangeMs,
}: {
  lane: ColumnarLane;
  rangeMs: number;
}) {
  const setHover = useHoverStore((s) => s.setHover);
  const setSelection = useAppStore((s) => s.setSelection);
  const pickIndex = useMemo(() => buildPickIndex(lane), [lane]);
  const heightWorld = (Math.min(lane.meta.maxDepth, DEPTH_CAP) + 1) * BOX_H;
  const minWidthMs = rangeMs * 0.0004;

  const resolve = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const local = event.point;
    const timeMs = msOf(local.x, rangeMs);
    const depth = Math.max(0, Math.floor(local.y / BOX_H));
    return pickEntry(lane, pickIndex, timeMs, depth, minWidthMs);
  };

  return (
    <mesh
      position={[TIME_W / 2, heightWorld / 2, 0]}
      onPointerMove={(event) => {
        const idx = resolve(event);
        setHover(
          idx === null
            ? null
            : {
                lane: lane.meta.id,
                idx,
                clientX: event.nativeEvent.clientX,
                clientY: event.nativeEvent.clientY,
              },
        );
      }}
      onPointerOut={() => setHover(null)}
      onClick={(event) => {
        const idx = resolve(event);
        if (idx !== null) {
          event.stopPropagation();
          setSelection({ kind: "entry", lane: lane.meta.id, idx });
        }
      }}
    >
      <boxGeometry args={[TIME_W, heightWorld, LANE_D * 0.95]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
