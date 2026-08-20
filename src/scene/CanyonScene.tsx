import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type {
  ColumnarLane,
  NetworkRequestInfo,
  ParsedTraceModel,
} from "../engine/types";
import { windowSlice } from "../engine/aggregate";
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
} from "./layout";
import { FlowArcs } from "./FlowArcs";
import { StallBands } from "./StallBands";
import { TimeRuler } from "./TimeRuler";
import { VitalsBeacons } from "./VitalsBeacons";

const LONG_TASK_MS = 50;
const LONG_TASK_TINT = new THREE.Color(STATUS_SERIOUS);
const BLOCKING_TINT = new THREE.Color(STATUS_SERIOUS);
const SELECT_TINT = new THREE.Color("#ffffff");
const dummy = new THREE.Object3D();
const color = new THREE.Color();

/**
 * V1 Flame Canyon: X = time, Y = stack depth, Z = one lane per visible
 * thread. With zoom on, the brush window becomes the full extent and events
 * outside it are culled entirely, so detail costs less, not more.
 */
export function CanyonScene({ model }: { model: ParsedTraceModel }) {
  const brush = useAppStore((s) => s.brush);
  const zoomed = useAppStore((s) => s.zoomed);
  const hiddenLanes = useAppStore((s) => s.hiddenLanes);
  const selection = useAppStore((s) => s.selection);

  const [t0, t1] =
    zoomed && brush ? brush : ([0, model.rangeMs] as [number, number]);

  const visibleLanes = useMemo(
    () => model.lanes.filter((lane) => !hiddenLanes.has(lane.meta.id)),
    [model, hiddenLanes],
  );
  const zIndexOf = useMemo(
    () => new Map(visibleLanes.map((lane, i) => [lane.meta.id, i])),
    [visibleLanes],
  );
  const worldDepth = visibleLanes.length * LANE_GAP;

  const markersInWindow = useMemo(
    () =>
      model.markers
        .filter((m) => m.ts >= t0 && m.ts <= t1)
        .map((m) => ({ ...m, ts: m.ts - t0 })),
    [model, t0, t1],
  );

  return (
    <group>
      <TimeRuler rangeMs={t1 - t0} depth={worldDepth} offsetMs={t0} />
      <VitalsBeacons
        markers={markersInWindow}
        rangeMs={t1 - t0}
        depth={worldDepth}
        height={DEPTH_CAP * BOX_H + 3}
      />
      <StallBands
        model={model}
        t0={t0}
        t1={t1}
        depth={worldDepth}
        height={DEPTH_CAP * BOX_H * 0.7}
      />
      {visibleLanes.map((lane, vi) => (
        <group key={lane.meta.id} position={[0, 0, laneZ(vi)]}>
          <LaneBoxes
            lane={lane}
            t0={t0}
            t1={t1}
            brush={zoomed ? null : brush}
            selection={selection}
            requests={lane.meta.kind === "network" ? model.requests : undefined}
          />
          <LaneHitbox lane={lane} t0={t0} t1={t1} />
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
      <FlowArcs model={model} t0={t0} t1={t1} zIndexOf={zIndexOf} />
      <SelectionHighlight model={model} t0={t0} t1={t1} zIndexOf={zIndexOf} />
    </group>
  );
}

function LaneBoxes({
  lane,
  t0,
  t1,
  brush,
  selection,
  requests,
}: {
  lane: ColumnarLane;
  t0: number;
  t1: number;
  brush: [number, number] | null;
  selection: Selection | null;
  requests?: NetworkRequestInfo[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const capacity = lane.starts.length;
  const range = t1 - t0;
  const minWidthMs = range * 0.0004;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const { starts, durs, depths, catIds, nameIds } = lane;
    const { lo, hi } = windowSlice(lane, t0, t1);

    let count = 0;
    for (let j = lo; j < hi; j++) {
      const start = starts[j];
      const durMs = Math.max(durs[j], minWidthMs);
      if (start + durMs < t0 || start > t1) continue;

      const clamped0 = Math.max(start, t0);
      const clamped1 = Math.min(start + durMs, t1);
      const w = Math.max(((clamped1 - clamped0) / range) * TIME_W, 0.015);
      const x = ((clamped0 - t0) / range) * TIME_W;
      const depth = Math.min(depths[j], DEPTH_CAP);

      dummy.position.set(x + w / 2, depth * BOX_H + BOX_H / 2, 0);
      dummy.scale.set(Math.max(w - 0.02, 0.01), BOX_H * 0.88, LANE_D * 0.9);
      dummy.updateMatrix();
      mesh.setMatrixAt(count, dummy.matrix);

      color.copy(CAT_COLORS[catIds[j]]);
      if (depths[j] === 0 && durs[j] >= LONG_TASK_MS) {
        color.lerp(LONG_TASK_TINT, 0.45);
      }
      if (requests?.[j]?.renderBlocking) {
        color.lerp(BLOCKING_TINT, 0.4);
      }
      const outsideBrush =
        brush !== null && (start + durs[j] < brush[0] || start > brush[1]);
      const dimmedBySelection =
        selection?.kind === "name" && nameIds[j] !== selection.nameId;
      if (outsideBrush || dimmedBySelection) {
        color.lerp(DIM_TARGET, 0.78);
      } else if (
        selection?.kind === "entry" &&
        selection.lane === lane.meta.id &&
        selection.idx === j
      ) {
        color.lerp(SELECT_TINT, 0.35);
      }
      mesh.setColorAt(count, color);
      count++;
    }

    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [lane, t0, t1, range, brush, selection, requests, minWidthMs]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, capacity]}
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
  t0,
  t1,
}: {
  lane: ColumnarLane;
  t0: number;
  t1: number;
}) {
  const setHover = useHoverStore((s) => s.setHover);
  const setSelection = useAppStore((s) => s.setSelection);
  const pickIndex = useMemo(() => buildPickIndex(lane), [lane]);
  const heightWorld = (Math.min(lane.meta.maxDepth, DEPTH_CAP) + 1) * BOX_H;
  const range = t1 - t0;
  const minWidthMs = range * 0.0004;

  const resolve = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const timeMs = t0 + (event.point.x / TIME_W) * range;
    const depth = Math.max(0, Math.floor(event.point.y / BOX_H));
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

/**
 * Soft halo around the selected event. Deliberately static: renders must
 * stay deterministic (same trace + same state = same pixels).
 */
function SelectionHighlight({
  model,
  t0,
  t1,
  zIndexOf,
}: {
  model: ParsedTraceModel;
  t0: number;
  t1: number;
  zIndexOf: Map<number, number>;
}) {
  const selection = useAppStore((s) => s.selection);
  const range = t1 - t0;

  const box = useMemo(() => {
    if (selection?.kind !== "entry") return null;
    const vi = zIndexOf.get(selection.lane);
    if (vi === undefined) return null;
    const lane = model.lanes[selection.lane];
    const start = lane.starts[selection.idx];
    const dur = Math.max(lane.durs[selection.idx], range * 0.0004);
    if (start + dur < t0 || start > t1) return null;
    const x0 = ((Math.max(start, t0) - t0) / range) * TIME_W;
    const x1 = ((Math.min(start + dur, t1) - t0) / range) * TIME_W;
    const depth = Math.min(lane.depths[selection.idx], DEPTH_CAP);
    return {
      position: [
        (x0 + x1) / 2,
        depth * BOX_H + BOX_H / 2,
        laneZ(vi),
      ] as [number, number, number],
      scale: [Math.max(x1 - x0, 0.05) + 0.3, BOX_H * 1.5, LANE_D] as [
        number,
        number,
        number,
      ],
    };
  }, [selection, model, t0, t1, range, zIndexOf]);

  if (!box) return null;
  return (
    <mesh position={box.position} scale={box.scale}>
      <boxGeometry />
      <meshBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.24}
        depthWrite={false}
      />
    </mesh>
  );
}
