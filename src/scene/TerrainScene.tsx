import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ContactShadows, Line } from "@react-three/drei";
import type { ParsedTraceModel } from "../engine/types";
import { bucketize } from "../engine/aggregate";
import { CATEGORIES, STATUS_SERIOUS } from "../engine/categories";
import { useAppStore, useHoverStore, windowOf } from "../state/store";
import { DataMaterial } from "./DataMaterial";
import { ScreenLabel } from "./ScreenLabels";
import { uploadInstances, writeBox } from "./instanceBuffers";
import {
  CAT_COLORS,
  LANE_D,
  LANE_GAP,
  TERRAIN_H,
  TIME_W,
  formatMs,
  scaleHeight,
} from "./layout";
import { TimeRuler } from "./TimeRuler";
import { VitalsBeacons } from "./VitalsBeacons";
import { ScreenshotStrip } from "./ScreenshotStrip";
import { TERRAIN_STRIP_Z } from "./sceneBounds";
import { FrameFloor } from "./FrameFloor";
import { StallBands } from "./StallBands";
import { BoxFeedback } from "./BoxFeedback";
import { aggregateSelectionBounds } from "./traceSelection";

const BUCKETS = 280;
const LONG_TASK_MS = 50;

/**
 * V2 Utilization Terrain: bucketed self-time per track as terrain strips.
 * The 50 ms snow line hovers over the main thread; vitals stand as beacons;
 * the screenshot filmstrip shows what the user saw at every mountain.
 */
export function TerrainScene({ model }: { model: ParsedTraceModel }) {
  const brush = useAppStore((s) => s.brush);
  const scale = useAppStore((s) => s.scale);
  const hiddenLanes = useAppStore((s) => s.hiddenLanes);
  const [t0, t1] = windowOf(model, brush);
  const selection = useAppStore((s) => s.selection);
  const selectedBounds = useMemo(() => aggregateSelectionBounds(model, selection, hiddenLanes, "terrain", [t0, t1]), [model, selection, hiddenLanes, t0, t1]);

  const visibleLanes = useMemo(
    () => model.lanes.filter((lane) => !hiddenLanes.has(lane.meta.id)).reverse(),
    [model, hiddenLanes],
  );
  const grid = useMemo(
    () => bucketize(visibleLanes, t0, t1, BUCKETS),
    [visibleLanes, t0, t1],
  );

  const worldDepth = visibleLanes.length * LANE_GAP;
  const bucketW = TIME_W / grid.bucketCount;
  const mainLaneId = model.lanes.find((l) => l.meta.kind === "main")?.meta.id;
  const mainLaneIndex = visibleLanes.findIndex((l) => l.meta.id === mainLaneId);

  const markersInWindow = useMemo(
    () => model.markers.filter((m) => m.ts >= t0 && m.ts <= t1),
    [model, t0, t1],
  );

  return (
    <group>
      {selectedBounds && <BoxFeedback id="terrain-selection" bounds={selectedBounds} label="Selected calls · time range" />}
      <TimeRuler rangeMs={t1 - t0} depth={worldDepth} offsetMs={t0} />
      <VitalsBeacons
        markers={markersInWindow.map((m) => ({ ...m, ts: m.ts - t0 }))}
        rangeMs={t1 - t0}
        depth={worldDepth}
        height={TERRAIN_H + 2}
      />
      {grid.lanes.map((bucketed, laneIndex) => (
        <group key={bucketed.laneId} position={[0, 0, laneIndex * LANE_GAP]}>
          <TerrainStrip
            busy={bucketed.busy}
            categories={bucketed.categoryTimes}
            maxBusy={visibleLanes[laneIndex].meta.kind === "network" ? Math.max(grid.bucketMs, ...bucketed.busy) : grid.bucketMs}
            bucketW={bucketW}
            scaleMode={scale}
            onHover={(bucket, event) => useHoverStore.getState().setHover({ lane: -1, idx: bucket, clientX: event.clientX, clientY: event.clientY, summary: {
              title: visibleLanes[laneIndex].meta.name,
              catId: bucketed.dominantCat[bucket],
              detail: `${formatMs(t0 + bucket * grid.bucketMs)} · ${formatMs(bucketed.busy[bucket])} ${visibleLanes[laneIndex].meta.kind === "network" ? "request time" : "busy"} in ${formatMs(grid.bucketMs)}${visibleLanes[laneIndex].meta.kind === "network" ? " (requests overlap)" : ""}`,
            } })}
            onSelect={(bucket) => {
              const start = Math.max(0, t0 + (bucket - 2) * grid.bucketMs);
              const end = Math.min(model.rangeMs, t0 + (bucket + 3) * grid.bucketMs);
              useAppStore.getState().setBrush([start, end]);
              useAppStore.getState().setZoomed(true);
              useAppStore.getState().setView("canyon");
            }}
          />
          <ScreenLabel id={`terrain-lane-${bucketed.laneId}`} position={[-3, 1.4, 0]} align="right" priority={visibleLanes[laneIndex].meta.kind === "main" ? 40 : 10} kind="lane">
              {visibleLanes[laneIndex].meta.name}
          </ScreenLabel>
        </group>
      ))}
      {mainLaneIndex >= 0 && (
        <LongTaskMarkers
          lane={visibleLanes[mainLaneIndex]}
          laneIndex={mainLaneIndex}
          t0={t0}
          t1={t1}
        />
      )}
      <StallBands
        model={model}
        t0={t0}
        t1={t1}
        depth={worldDepth}
        height={TERRAIN_H * 0.8}
      />
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
        z={TERRAIN_STRIP_Z}
      />
      <MemoryRiver model={model} t0={t0} t1={t1} z={-5} />
      <ContactShadows key={`${model.boundsMinUs}-${t0}-${t1}-${scale}-${visibleLanes.map((lane) => lane.meta.id).join(",")}`} position={[TIME_W / 2, -0.1, worldDepth / 2]} scale={Math.max(TIME_W, worldDepth) + 12} far={TERRAIN_H + 1} opacity={0.35} blur={2} resolution={256} frames={1} />
    </group>
  );
}

function TerrainStrip({
  busy,
  categories,
  maxBusy,
  bucketW,
  scaleMode,
  onHover,
  onSelect,
}: {
  busy: Float32Array;
  categories: Float32Array;
  maxBusy: number;
  bucketW: number;
  scaleMode: "linear" | "log";
  onHover: (bucket: number, event: PointerEvent) => void;
  onSelect: (bucket: number) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = busy.length;
  const bucketOf = useRef<number[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let instances = 0;
    bucketOf.current = [];
    let tallest = 0;
    for (let i = 0; i < count; i++) {
      if (busy[i] <= 1e-6) continue;
      const h = scaleHeight(busy[i], maxBusy, TERRAIN_H, scaleMode);
      tallest = Math.max(tallest, h);
      let y = 0;
      for (let cat = 0; cat < CATEGORIES.length; cat++) {
        const band = h * categories[i * CATEGORIES.length + cat] / busy[i];
        if (band <= 1e-6) continue;
        writeBox(mesh, instances, (i + 0.5) * bucketW, y + band / 2, 0, bucketW, band, LANE_D * 0.92);
        mesh.setColorAt(instances, CAT_COLORS[cat]);
        bucketOf.current.push(i);
        y += band;
        instances++;
      }
    }
    uploadInstances(mesh, instances, { min: [0, 0, -LANE_D / 2], max: [TIME_W, tallest, LANE_D / 2] });
  }, [busy, categories, maxBusy, bucketW, scaleMode, count]);

  return (
    <><instancedMesh
      ref={ref}
      args={[undefined, undefined, count * CATEGORIES.length]}
      onPointerMove={(event) => { if (event.instanceId !== undefined) { event.stopPropagation(); const bucket = bucketOf.current[event.instanceId]; setHovered(bucket); onHover(bucket, event.nativeEvent); } }}
      onPointerOut={() => { setHovered(null); useHoverStore.getState().setHover(null); }}
      onClick={(event) => { if (event.instanceId !== undefined && event.delta < 4) { event.stopPropagation(); onSelect(bucketOf.current[event.instanceId]); } }}
    >
      <boxGeometry />
      <DataMaterial />
    </instancedMesh>
    {hovered !== null && <BoxFeedback id={`terrain-hover-${hovered}`} label={`${formatMs(busy[hovered])} busy`} bounds={{ min: [hovered * bucketW, 0, -LANE_D * 0.46], max: [(hovered + 1) * bucketW, scaleHeight(busy[hovered], maxBusy, TERRAIN_H, scaleMode), LANE_D * 0.46] }} />}</>
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

  const ref = useRef<THREE.InstancedMesh>(null);
  const range = t1 - t0;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    tasks.forEach((task, i) => {
      const x0 = ((task.start - t0) / range) * TIME_W;
      const width = ((task.end - task.start) / range) * TIME_W;
      writeBox(mesh, i, x0 + width / 2, 0, 0, width, 0.35, LANE_D * 0.5);
    });
    uploadInstances(mesh, tasks.length, { min: [0, -0.175, -LANE_D / 4], max: [TIME_W, 0.175, LANE_D / 4] });
  }, [tasks, range, t0]);
  if (tasks.length === 0) return null;
  return (
    <group position={[0, TERRAIN_H + 1, laneIndex * LANE_GAP]}>
      <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, tasks.length)]} count={tasks.length} raycast={() => {}}>
        <boxGeometry /><meshBasicMaterial color={STATUS_SERIOUS} toneMapped={false} fog={false} />
      </instancedMesh>
      <ScreenLabel id="terrain-long-tasks" position={[TIME_W + 4, 0, 0]} align="left" priority={30}>
          long tasks &gt;50 ms
      </ScreenLabel>
    </group>
  );
}

/** JS heap along the far edge; GC dips stay visible as an area ribbon. */
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
    if (maxHeap <= 0) return null;
    return inWindow.map(
      (m) =>
        new THREE.Vector3(
          ((m.ts - t0) / (t1 - t0)) * TIME_W,
          (m.jsHeapUsed / maxHeap) * 5 + 0.2,
          z,
        ),
    );
  }, [model, t0, t1, z]);

  const area = useMemo(() => {
    const vertices: number[] = [];
    if (!points) return new Float32Array();
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      vertices.push(a.x, 0, z, a.x, a.y, z, b.x, b.y, z, a.x, 0, z, b.x, b.y, z, b.x, 0, z);
    }
    return Float32Array.from(vertices);
  }, [points, z]);

  if (!points) return null;
  return (
    <group>
      <mesh frustumCulled={false}><bufferGeometry><bufferAttribute attach="attributes-position" args={[area, 3]} /></bufferGeometry><meshBasicMaterial color="#3987e5" opacity={0.22} transparent side={THREE.DoubleSide} depthWrite={false} fog={false} /></mesh>
      <Line points={points} color="#86b6ef" lineWidth={2} fog={false} />
      <ScreenLabel id="heap" position={[points[points.length - 1].x + 4, points[points.length - 1].y, z]} align="left" priority={35}>
          JS heap
      </ScreenLabel>
    </group>
  );
}
