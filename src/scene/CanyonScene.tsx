import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import type { NetworkRequestInfo, ParsedTraceModel } from "../engine/types";
import { useAppStore, useHoverStore } from "../state/store";
import { buildPickIndex, pickLaneRay, type LanePickIndex } from "./picking";
import { BOX_H, CAT_COLORS, LANE_D, TIME_W, formatMs } from "./layout";
import { eventBounds, traceLayout, TOP_ROW_D, type LanePlacement } from "./traceLayout";
import { canyonSpans, isVisibleSpan, tinySelectionSpans } from "./canyonLod";
import { DataMaterial } from "./DataMaterial";
import { uploadInstances, writeBox } from "./instanceBuffers";
import { ScreenLabel } from "./ScreenLabels";
import { EventFeedback } from "./EventFeedback";
import { FlowArcs } from "./FlowArcs";
import { TimeRuler } from "./TimeRuler";
import { VitalsBeacons } from "./VitalsBeacons";
import { StallBands } from "./StallBands";
import { indexRenderedLane, type RenderedLane } from "./renderedLane";
import type { EventSpan } from "./canyonLod";
import type { WorldBounds } from "./cameraActions";
import { SCENE_DEBUG } from "./diagnostics";

export function CanyonScene({ model }: { model: ParsedTraceModel }) {
  const brush = useAppStore((s) => s.brush);
  const zoomed = useAppStore((s) => s.zoomed);
  const hiddenLanes = useAppStore((s) => s.hiddenLanes);
  const preset = useAppStore((s) => s.preset);
  const [t0, t1] = zoomed && brush ? brush : [0, model.rangeMs];
  const layout = useMemo(() => traceLayout(model.lanes.filter((lane) => !hiddenLanes.has(lane.meta.id)), preset), [model, hiddenLanes, preset]);
  const markers = useMemo(() => model.markers.filter((m) => m.ts >= t0 && m.ts <= t1).map((m) => ({ ...m, ts: m.ts - t0 })), [model, t0, t1]);
  const depth = layout.bounds.max[2];
  return <group>
    <TimeRuler rangeMs={t1 - t0} depth={depth} offsetMs={t0} />
    <VitalsBeacons markers={markers} rangeMs={t1 - t0} depth={depth} height={Math.min(24, layout.bounds.max[1]) + 3} />
    {preset !== "side" && <StallBands model={model} t0={t0} t1={t1} depth={depth} height={8} />}
    {layout.placements.map((placement) => <group key={placement.lane.meta.id} position={[0, placement.y, placement.z]}>
      <LaneGraphics placement={placement} t0={t0} t1={t1} requests={model.requests} />
      <ScreenLabel id={`lane-${placement.lane.meta.id}`} position={preset === "orbit" && placement.lane === layout.placements[0]?.lane ? [TIME_W / 2, 1, LANE_D / 2 + 3] : [-2, placement.top ? 1 : Math.min(2, placement.height / 2), 0]} align={preset === "orbit" && placement.lane === layout.placements[0]?.lane ? "center" : "right"} priority={placement.lane.meta.kind === "main" ? 70 : 10} kind="lane">
        {placement.lane.meta.name}
      </ScreenLabel>
    </group>)}
    <FlowArcs model={model} t0={t0} t1={t1} placements={layout.placements} />
    <EventFeedback model={model} placements={layout.placements} t0={t0} t1={t1} />
  </group>;
}

function LaneGraphics({ placement, t0, t1, requests }: { placement: LanePlacement; t0: number; t1: number; requests: NetworkRequestInfo[] }) {
  const lane = placement.lane;
  const pickIndex = useMemo(() => buildPickIndex(placement.lane), [placement.lane]);
  const flags = useMemo(() => Uint8Array.from(lane.starts, (_, i) => lane.meta.kind === "network" && requests[i]?.renderBlocking ? 2 : lane.meta.kind === "main" && lane.depths[i] === 0 && lane.durs[i] >= 50 ? 1 : 0), [lane, requests]);
  const nameIndex = useMemo(() => {
    const map = new Map<number, number[]>();
    placement.lane.nameIds.forEach((name, i) => {
      const entries = map.get(name);
      if (entries) entries.push(i); else map.set(name, [i]);
    });
    return map;
  }, [placement.lane]);
  const selectedName = useAppStore((s) => s.selection?.kind === "name" ? s.selection.nameId : -1);
  const selectedIndex = useMemo(() => selectedName >= 0 && nameIndex.has(selectedName) ? buildPickIndex(placement.lane, nameIndex.get(selectedName)!) : null, [placement.lane, nameIndex, selectedName]);
  const renderedRef = useRef<RenderedLane | null>(null);
  return <>
    <LaneBoxes placement={placement} pickIndex={pickIndex} renderedRef={renderedRef} t0={t0} t1={t1} flags={flags} />
    <LaneHitbox placement={placement} renderedRef={renderedRef} t0={t0} t1={t1} />
    {selectedIndex && <LaneBoxes key={selectedName} placement={placement} pickIndex={selectedIndex} t0={t0} t1={t1} flags={flags} capacity={nameIndex.get(selectedName)!.length} highlight />}
  </>;
}

function LaneBoxes({ placement, pickIndex, renderedRef, t0, t1, flags, capacity = placement.lane.starts.length, highlight = false }: { placement: LanePlacement; pickIndex: LanePickIndex; renderedRef?: RefObject<RenderedLane | null>; t0: number; t1: number; flags: Uint8Array; capacity?: number; highlight?: boolean }) {
  const { lane, top, levelH } = placement;
  const ref = useRef<THREE.InstancedMesh>(null);
  const markers = useRef<THREE.Points>(null);
  const markerPositions = useMemo(() => new Float32Array(128 * 3), []);
  const brush = useAppStore((s) => s.zoomed ? null : s.brush);
  const selectedName = useAppStore((s) => s.selection?.kind === "name" ? s.selection.nameId : -1);
  const range = Math.max(1e-6, t1 - t0);
  const names = useMemo(() => new Float32Array(Math.max(1, capacity)), [capacity]);
  const statuses = useMemo(() => new Float32Array(Math.max(1, capacity)), [capacity]);
  const lastLevel = useRef(Infinity);
  const origin = useMemo(() => new THREE.Vector3(), []);
  const end = useMemo(() => new THREE.Vector3(), []);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => { lastLevel.current = Infinity; invalidate(); }, [lane, t0, t1, top, levelH, invalidate]);

  useFrame(({ camera, size }) => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.updateWorldMatrix(true, false);
    origin.set(0, placement.height / 2, 0).applyMatrix4(mesh.matrixWorld).project(camera);
    end.set(TIME_W, placement.height / 2, 0).applyMatrix4(mesh.matrixWorld).project(camera);
    const projectedPixels = Math.hypot((end.x - origin.x) * size.width / 2, (end.y - origin.y) * size.height / 2);
    const pixelLimit = Math.max(size.width, size.height) * 64;
    const pixels = Math.max(32, Math.min(pixelLimit, Number.isFinite(projectedPixels) ? projectedPixels : pixelLimit));
    const desired = Math.pow(2, Math.floor(Math.log2(range / pixels)));
    const current = lastLevel.current;
    if (desired === current || (desired > current && range / pixels < current * 2.3)) return;
    const allSpans = canyonSpans(lane, pickIndex, t0, t1, desired, flags);
    const spans = allSpans.filter((s) => isVisibleSpan(s, desired));
    if (markers.current) {
      const tiny = tinySelectionSpans(allSpans, desired);
      const positions = markers.current.geometry.getAttribute("position") as THREE.BufferAttribute;
      tiny.forEach((span, i) => positions.setXYZ(i, ((span.start + span.end) / 2 - t0) / range * TIME_W,
        top ? BOX_H : (span.depth + 0.95) * levelH,
        top ? (span.depth + 0.5) * TOP_ROW_D * levelH / BOX_H : 0));
      positions.needsUpdate = true;
      markers.current.geometry.setDrawRange(0, tiny.length);
    }
    const attribute = mesh.geometry.getAttribute("traceName") as THREE.InstancedBufferAttribute;
    const statusAttribute = mesh.geometry.getAttribute("traceStatus") as THREE.InstancedBufferAttribute;
    let count = 0;
    let aggregated = 0;
    for (const span of spans) {
      const width = (span.end - span.start) / range * TIME_W;
      const x = (span.start - t0) / range * TIME_W + width / 2;
      const share = span.duration > 0 ? Math.min(1, span.self / span.duration) : 0;
      writeBox(mesh, count, x, top ? BOX_H / 2 : (span.depth + 0.5) * levelH,
        top ? (span.depth + 0.5) * TOP_ROW_D * levelH / BOX_H : 0, width, (top ? BOX_H : levelH) * 0.9,
        top ? TOP_ROW_D * levelH / BOX_H * 0.9 : LANE_D * (0.18 + 0.72 * share));
      mesh.setColorAt(count, CAT_COLORS[span.catId]);
      attribute.setX(count, span.nameId);
      statusAttribute.setX(count, span.status);
      if (span.count > 1) aggregated += span.count;
      count++;
    }
    attribute.clearUpdateRanges();
    if (count) attribute.addUpdateRange(0, count);
    attribute.needsUpdate = true;
    statusAttribute.clearUpdateRanges();
    if (count) statusAttribute.addUpdateRange(0, count);
    statusAttribute.needsUpdate = true;
    uploadInstances(mesh, count, { min: [0, 0, top ? 0 : -LANE_D / 2], max: [TIME_W, placement.height, top ? placement.depth : LANE_D / 2] });
    mesh.userData.sourceEvents = lane.starts.length;
    mesh.userData.aggregatedEvents = aggregated;
    mesh.userData.pixelMs = desired;
    if (SCENE_DEBUG) {
      mesh.userData.sourceIndices = spans.map((s) => s.entry);
      mesh.userData.sourceCounts = spans.map((s) => s.count);
    }
    if (renderedRef) {
      renderedRef.current = indexRenderedLane(lane, spans);
      const hover = useHoverStore.getState().hover;
      if (hover?.source === "canyon" && hover.lane === lane.meta.id) useHoverStore.getState().setHover(null);
    }
    lastLevel.current = desired;
  });

  return <instancedMesh ref={ref} name={`canyon-${highlight ? "highlight" : "lane"}-${lane.meta.id}`} args={[undefined, undefined, Math.max(1, capacity)]} count={0} raycast={() => {}} renderOrder={highlight ? 1 : 0}>
    <boxGeometry>
      <instancedBufferAttribute attach="attributes-traceName" args={[names, 1]} usage={THREE.DynamicDrawUsage} />
      <instancedBufferAttribute attach="attributes-traceStatus" args={[statuses, 1]} usage={THREE.DynamicDrawUsage} />
    </boxGeometry>
    <DataMaterial names status highlight={highlight} selectedName={selectedName} brush={brush ? [(brush[0] - t0) / range * TIME_W, (brush[1] - t0) / range * TIME_W] : null} />
    {highlight && <points ref={markers} name={`canyon-selection-markers-${lane.meta.id}`} raycast={() => {}} frustumCulled={false} renderOrder={3}>
      <bufferGeometry drawRange={{ start: 0, count: 0 }}><bufferAttribute attach="attributes-position" args={[markerPositions, 3]} usage={THREE.DynamicDrawUsage} /></bufferGeometry>
      <pointsMaterial color="#f5f5f7" size={4} sizeAttenuation={false} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
    </points>}
  </instancedMesh>;
}

function LaneHitbox({ placement, renderedRef, t0, t1 }: { placement: LanePlacement; renderedRef: RefObject<RenderedLane | null>; t0: number; t1: number }) {
  const { lane, top } = placement;
  const inverse = useMemo(() => new THREE.Matrix4(), []);
  const localRay = useMemo(() => new THREE.Ray(), []);
  const hovered = useRef<{ span: EventSpan; bounds: WorldBounds | null } | null>(null);
  const select = (event: ThreeEvent<MouseEvent>, focus = false) => {
    const span = event.instanceId === undefined ? null : renderedRef.current?.spans[event.instanceId];
    if (!span || event.delta > 4) return;
    event.stopPropagation();
    if (span.count > 1) {
      const padding = Math.max((span.end - span.start) * 0.15, (t1 - t0) / 1000);
      const state = useAppStore.getState();
      state.setBrush([Math.max(t0, span.start - padding), Math.min(t1, span.end + padding)]);
      state.setZoomed(true);
      useHoverStore.getState().setHover(null);
      return;
    }
    useAppStore.getState().setSelection({ kind: "entry", lane: lane.meta.id, idx: span.entry });
    if (focus) useAppStore.getState().requestCameraAction("fit-selection");
  };
  return <object3D name={`pick-lane-${lane.meta.id}`}
    raycast={function (this: THREE.Object3D, raycaster, hits) {
      this.updateWorldMatrix(true, false);
      localRay.copy(raycaster.ray).applyMatrix4(inverse.copy(this.matrixWorld).invert());
      const visible = renderedRef.current;
      if (!visible) return;
      const hit = pickLaneRay(visible.geometry, visible.index, localRay, top, t0, t1, placement.levelH);
      if (!hit) return;
      hit.point.applyMatrix4(this.matrixWorld);
      const distance = hit.point.distanceTo(raycaster.ray.origin);
      if (distance >= raycaster.near && distance <= raycaster.far) hits.push({ distance, point: hit.point, object: this, instanceId: hit.idx });
    }}
    onPointerMove={(event) => {
      const span = event.instanceId === undefined ? null : renderedRef.current?.spans[event.instanceId];
      if (!span) return;
      event.stopPropagation();
      if (hovered.current?.span !== span) hovered.current = { span, bounds: renderedRef.current ? eventBounds({ ...placement, lane: renderedRef.current.geometry }, event.instanceId!, t0, t1) : null };
      useHoverStore.getState().setHover({ source: "canyon", lane: lane.meta.id, idx: span.entry, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY,
        bounds: span.count > 1 ? hovered.current.bounds ?? undefined : undefined,
        ...(span.count > 1 ? { summary: { title: `${span.count.toLocaleString()} events · stack level ${span.depth}`, catId: span.catId,
          detail: `${formatMs(span.start)} to ${formatMs(span.end)} · aggregated at this zoom. Click to expand.` } } : {}),
      });
    }}
    onPointerOut={() => {
      const hover = useHoverStore.getState().hover;
      if (hover?.source === "canyon" && hover.lane === lane.meta.id) useHoverStore.getState().setHover(null);
    }}
    onClick={(event) => select(event)} onDoubleClick={(event) => select(event, true)} />;
}
