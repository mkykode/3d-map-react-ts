import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Billboard, Line, Text } from "@react-three/drei";
import type { ParsedTraceModel } from "../engine/types";
import { bucketize } from "../engine/aggregate";
import { STATUS_SERIOUS } from "../engine/categories";
import { useAppStore, windowOf } from "../state/store";
import {
  CAT_COLORS,
  DIM_TARGET,
  INK_MUTED,
  INK_SECONDARY,
  LANE_D,
  LANE_GAP,
  TERRAIN_H,
  TIME_W,
  laneZ,
  scaleHeight,
} from "./layout";
import { TimeRuler } from "./TimeRuler";
import { VitalsBeacons } from "./VitalsBeacons";
import { ScreenshotStrip } from "./ScreenshotStrip";
import { FrameFloor } from "./FrameFloor";

const BUCKETS = 280;
const LONG_TASK_MS = 50;
const dummy = new THREE.Object3D();
const color = new THREE.Color();

/**
 * V2 Utilization Terrain: bucketed self-time per track as terrain strips.
 * The 50 ms snow line hovers over the main thread; vitals stand as beacons;
 * the screenshot filmstrip shows what the user saw at every mountain.
 */
export function TerrainScene({ model }: { model: ParsedTraceModel }) {
  const brush = useAppStore((s) => s.brush);
  const scale = useAppStore((s) => s.scale);
  const [t0, t1] = windowOf(model, brush);

  const grid = useMemo(
    () => bucketize(model.lanes, t0, t1, BUCKETS),
    [model, t0, t1],
  );
  const maxBusy = useMemo(() => {
    let max = 0;
    for (const lane of grid.lanes) {
      for (const v of lane.busy) if (v > max) max = v;
    }
    return Math.max(max, 1e-3);
  }, [grid]);

  const worldDepth = model.lanes.length * LANE_GAP;
  const bucketW = TIME_W / grid.bucketCount;
  const mainLaneIndex = model.lanes.findIndex((l) => l.meta.kind === "main");

  const markersInWindow = useMemo(
    () => model.markers.filter((m) => m.ts >= t0 && m.ts <= t1),
    [model, t0, t1],
  );

  return (
    <group>
      <TimeRuler rangeMs={t1 - t0} depth={worldDepth} />
      <VitalsBeacons
        markers={markersInWindow.map((m) => ({ ...m, ts: m.ts - t0 }))}
        rangeMs={t1 - t0}
        depth={worldDepth}
        height={TERRAIN_H + 2}
      />
      {grid.lanes.map((bucketed, laneIndex) => (
        <group key={bucketed.laneId} position={[0, 0, laneZ(laneIndex)]}>
          <TerrainStrip
            busy={bucketed.busy}
            dominant={bucketed.dominantCat}
            maxBusy={maxBusy}
            bucketW={bucketW}
            scaleMode={scale}
          />
          <Billboard position={[-3, 1.4, 0]}>
            <Text
              fontSize={1.1}
              color={INK_SECONDARY}
              anchorX="right"
              anchorY="middle"
            >
              {model.lanes[bucketed.laneId].meta.name}
            </Text>
          </Billboard>
        </group>
      ))}
      {mainLaneIndex >= 0 && (
        <LongTaskMarkers
          lane={model.lanes[mainLaneIndex]}
          laneIndex={mainLaneIndex}
          t0={t0}
          t1={t1}
        />
      )}
      <FrameFloor
        frames={model.frames}
        t0={t0}
        t1={t1}
        z={-3}
      />
      <ScreenshotStrip
        screenshots={model.screenshots}
        t0={t0}
        t1={t1}
        y={TERRAIN_H + 6}
        z={worldDepth + 2}
      />
      <MemoryRiver model={model} t0={t0} t1={t1} z={worldDepth + 0.5} />
    </group>
  );
}

function TerrainStrip({
  busy,
  dominant,
  maxBusy,
  bucketW,
  scaleMode,
}: {
  busy: Float32Array;
  dominant: Uint8Array;
  maxBusy: number;
  bucketW: number;
  scaleMode: "linear" | "log";
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = busy.length;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < count; i++) {
      const h = Math.max(scaleHeight(busy[i], maxBusy, TERRAIN_H, scaleMode), 0.02);
      dummy.position.set(i * bucketW + bucketW / 2, h / 2, 0);
      dummy.scale.set(bucketW, h, LANE_D * 0.92);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.copy(CAT_COLORS[dominant[i]]);
      // Near-idle buckets recede toward the surface so color implies work.
      if (busy[i] <= maxBusy * 0.004) color.lerp(DIM_TARGET, 0.85);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [busy, dominant, maxBusy, bucketW, scaleMode, count]);

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
 * Long tasks (top-level main-thread work over 50 ms) as status-red bars
 * floating above the main lane, spanning each task's real time range.
 */
function LongTaskMarkers({
  lane,
  laneIndex,
  t0,
  t1,
}: {
  lane: ParsedTraceModel["lanes"][number];
  laneIndex: number;
  t0: number;
  t1: number;
}) {
  const tasks = useMemo(() => {
    const list: { start: number; end: number }[] = [];
    for (let i = 0; i < lane.starts.length; i++) {
      if (lane.depths[i] !== 0 || lane.durs[i] < LONG_TASK_MS) continue;
      const start = lane.starts[i];
      const end = start + lane.durs[i];
      if (end < t0 || start > t1) continue;
      list.push({ start: Math.max(start, t0), end: Math.min(end, t1) });
    }
    return list;
  }, [lane, t0, t1]);

  if (tasks.length === 0) return null;
  const range = t1 - t0;
  return (
    <group position={[0, TERRAIN_H + 1, laneZ(laneIndex)]}>
      {tasks.map((task, i) => {
        const x0 = ((task.start - t0) / range) * TIME_W;
        const w = Math.max(((task.end - task.start) / range) * TIME_W, 0.1);
        return (
          <mesh key={i} position={[x0 + w / 2, 0, 0]}>
            <boxGeometry args={[w, 0.35, LANE_D * 0.5]} />
            <meshBasicMaterial color={STATUS_SERIOUS} />
          </mesh>
        );
      })}
      <Billboard position={[TIME_W + 4, 0, 0]}>
        <Text fontSize={1} color={INK_MUTED} anchorX="left">
          long tasks &gt;50 ms
        </Text>
      </Billboard>
    </group>
  );
}

/** JS heap ribbon along the back wall; GC dips read as cliffs. */
function MemoryRiver({
  model,
  t0,
  t1,
  z,
}: {
  model: ParsedTraceModel;
  t0: number;
  t1: number;
  z: number;
}) {
  const points = useMemo(() => {
    const inWindow = model.memory.filter((m) => m.ts >= t0 && m.ts <= t1);
    if (inWindow.length < 2) return null;
    let maxHeap = 0;
    for (const m of inWindow) if (m.jsHeapUsed > maxHeap) maxHeap = m.jsHeapUsed;
    return inWindow.map(
      (m) =>
        new THREE.Vector3(
          ((m.ts - t0) / (t1 - t0)) * TIME_W,
          (m.jsHeapUsed / maxHeap) * 5 + 0.2,
          z,
        ),
    );
  }, [model, t0, t1, z]);

  if (!points) return null;
  return (
    <group>
      <Line points={points} color="#86b6ef" lineWidth={1.5} transparent opacity={0.75} />
      <Billboard position={[points[points.length - 1].x + 4, points[points.length - 1].y, z]}>
        <Text fontSize={1} color={INK_MUTED} anchorX="left">
          JS heap
        </Text>
      </Billboard>
    </group>
  );
}
