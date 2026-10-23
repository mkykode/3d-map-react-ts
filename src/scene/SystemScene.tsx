import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Color, InstancedBufferAttribute, InstancedMesh, type WebGLProgramParametersWithUniforms } from "three";
import type { ParsedTraceModel } from "../engine/types";
import { activeIntervals, playbackIndex } from "../engine/moments";
import { threadDefinition } from "../evidence/definitions";
import { useAppStore, useHoverStore, windowOf } from "../state/store";
import { CAT_COLORS, formatMs, scaleHeight } from "./layout";
import { writeBox, uploadInstances } from "./instanceBuffers";
import { connectedLanes, SYSTEM_FLOOR, SYSTEM_WORK_HEIGHT, systemLayout, type SystemBuilding } from "./systemLayout";
import { ConnectionArcs } from "./ConnectionArcs";
import { ConnectionPackets } from "./ConnectionPackets";
import { systemConnections } from "./systemConnections";
import { ScreenLabel } from "./ScreenLabels";
import type { WorldBounds } from "./cameraActions";
import { CAT_ID, CATEGORIES, STATUS_SERIOUS } from "../engine/categories";
import { DataMaterial } from "./DataMaterial";
import { componentContext, connectionLabel, CONNECTION_MEANING, requestOwner, threadLabel } from "../evidence/systemContext";

export function SystemScene({ model }: { model: ParsedTraceModel }) {
  const brush = useAppStore((state) => state.brush);
  const hidden = useAppStore((state) => state.hiddenLanes);
  const scale = useAppStore((state) => state.scale);
  const selection = useAppStore((state) => state.selection);
  const preset = useAppStore((state) => state.preset);
  const [t0, t1] = windowOf(model, brush);
  const layout = useMemo(() => systemLayout(model, hidden, t0, t1, scale), [model, hidden, t0, t1, scale]);
  const related = useMemo(() => connectedLanes(model, selection), [model, selection]);
  const index = useMemo(() => playbackIndex(model), [model]);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => useAppStore.subscribe((state, previous) => { if (state.playhead !== previous.playhead) invalidate(); }), [invalidate]);
  const routes = useMemo(() => systemConnections(model, layout, selection), [model, layout, selection]);
  const requestAnchors = useMemo(() => new Map(layout.requests.map((request) => [request.index, request.anchor])), [layout]);
  const ticks = [0, layout.heightMax / 2, layout.heightMax];
  const scaleX = -20;
  const scaleZ = layout.plates.find((plate) => plate.bounds.min[2] === 0)?.bounds.min[2] ?? 0;
  const scaleBoxes: WorldBounds[] = [{ min: [scaleX, SYSTEM_FLOOR, scaleZ + 14], max: [scaleX + 0.2, SYSTEM_FLOOR + SYSTEM_WORK_HEIGHT, scaleZ + 14.2] }, ...ticks.map((value): WorldBounds => {
    const y = SYSTEM_FLOOR + scaleHeight(value, layout.heightMax, SYSTEM_WORK_HEIGHT, scale);
    return { min: [scaleX - 1, y, scaleZ + 14], max: [scaleX + 1, y + 0.15, scaleZ + 14.2] };
  })];
  const hoverBuilding = (building: SystemBuilding, event: ThreeEvent<PointerEvent>) => {
    const lane = model.lanes[building.lane];
    useHoverStore.getState().setHover({ source: "system", idx: building.lane, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY,
       summary: { title: `${componentContext(model, building.lane, t0, t1).title} / ${threadLabel(lane.meta)}`, catId: building.catId,
        detail: `${formatMs(building.busy)} busy · ${building.busy > 0 ? `${CATEGORIES[building.catId].label} is the largest category by busy time.` : "No work in this window."} ${building.incoming} links in · ${building.outgoing} links out. Top activities: ${building.activities.slice(0, 3).map((row) => `${model.names[row.nameId]} ${formatMs(row.self)}`).join(", ") || "None in this window"}.`, definition: threadDefinition(lane.meta) } });
  };
  return <group name="system-board">
    <SystemBoxes name="system-plates" boxes={layout.plates.map((plate) => plate.bounds)} bounds={layout.bounds} />
    <SystemBoxes name="system-request-areas" boxes={layout.plates.flatMap((plate) => plate.requestArea ? [plate.requestArea] : [])} bounds={layout.bounds} color="#1e2026" />
    <SystemBoxes name="system-thread-bases" boxes={layout.buildings.map(({ bounds }): WorldBounds => ({ min: [bounds.min[0] - 0.5, SYSTEM_FLOOR, bounds.min[2] - 0.5], max: [bounds.max[0] + 0.5, SYSTEM_FLOOR + 0.08, bounds.max[2] + 0.5] }))} bounds={layout.bounds} color="#5c6470"
      onHover={(i, event) => hoverBuilding(layout.buildings[i], event)} onSelect={(i) => useAppStore.getState().setSelection({ kind: "lane", lane: layout.buildings[i].lane })} />
    <SystemBuildings buildings={layout.buildings.filter((building) => building.busy > 0)} bounds={layout.bounds} related={related} index={index} onHover={hoverBuilding} />
    <SystemBoxes name="system-requests" boxes={layout.requests.map((request) => request.bounds)} bounds={layout.bounds}
      onHover={(i, event) => {
        const request = model.requests[layout.requests[i].index];
        useHoverStore.getState().setHover({ source: "system", idx: i, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY,
          summary: { title: request.url, catId: CAT_ID.loading, detail: `Requested by ${requestOwner(model, request).title}. ${formatMs(request.end - request.start)} request lifetime · ${formatMs(request.start)} to ${formatMs(request.end)}. ${request.renderBlocking ? "Render-blocking request." : ""}` } });
      }}
      onSelect={(i) => {
        const lane = model.lanes.find((lane) => lane.meta.kind === "network");
        if (lane) useAppStore.getState().setSelection({ kind: "entry", lane: lane.meta.id, idx: layout.requests[i].index });
      }} />
    <SystemBoxes name="system-blocking-flags" boxes={layout.requests.flatMap(({ index, bounds }): WorldBounds[] => model.requests[index].renderBlocking ? [{ min: [bounds.min[0], bounds.max[1] + 0.02, bounds.max[2] - 0.45], max: [bounds.max[0], bounds.max[1] + 0.12, bounds.max[2]] }] : [])} bounds={layout.bounds} color={STATUS_SERIOUS} />
    <ConnectionArcs arcs={routes.arcs} onSelect={(arc) => {
      const network = model.lanes.find((lane) => lane.meta.kind === "network");
      useAppStore.getState().setSelection(arc.request !== undefined && network ? { kind: "entry", lane: network.meta.id, idx: arc.request } : { kind: "connection", edge: arc.id });
    }}
      onHover={(arc, event) => {
        if (!arc) { useHoverStore.getState().setHover(null); return; }
        const edge = model.connections.edges[arc.id];
        useHoverStore.getState().setHover({ source: "connection", idx: arc.id, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY,
          summary: { title: connectionLabel(model, edge, t0, t1), catId: 0,
            detail: `${arc.count} ${edge.provenance} links · ${CONNECTION_MEANING[edge.kind].label}. ${CONNECTION_MEANING[edge.kind].description}` } });
      }} />
    <ConnectionPackets model={model} arcs={routes.arcs} index={index} anchors={layout.anchors} requests={requestAnchors} />
    <SystemBoxes name="system-work-scale" boxes={scaleBoxes} bounds={layout.bounds} color="#8a8f98" />
    {ticks.map((value) => <ScreenLabel key={value} id={`system-scale-${value}`} position={[scaleX - 2, SYSTEM_FLOOR + scaleHeight(value, layout.heightMax, SYSTEM_WORK_HEIGHT, scale), scaleZ + 14]} priority={115} align="right">{formatMs(value)}</ScreenLabel>)}
    {routes.omitted > 0 && <ScreenLabel id="system-route-limit" position={[layout.bounds.max[0] / 2, 1, layout.bounds.max[2]]} priority={100}>{routes.arcs.length} routes shown · {routes.omitted} more in the guide</ScreenLabel>}
    {layout.plates.map((plate) => <ScreenLabel key={plate.id} id={`system-${plate.id}`} position={[(plate.bounds.min[0] + plate.bounds.max[0]) / 2, plate.infrastructure ? preset === "side" ? SYSTEM_WORK_HEIGHT + 28 : 12 : 1.2, plate.infrastructure ? plate.bounds.min[2] : plate.bounds.max[2] + 10]} priority={120} kind="district">
      <strong>{plate.label}</strong><br /><span className="system-label-domain">{plate.context.domain || (plate.id === "unknown" ? "No requester recorded" : "Browser infrastructure")}</span><br />
      <span className="system-label-domain">{plate.context.relationship || "Shared browser service"}</span>
    </ScreenLabel>)}
    {layout.plates.filter((plate) => plate.requestArea).map((plate) => <ScreenLabel key={plate.id} id={`system-requests-${plate.id}`} position={[(plate.bounds.min[0] + plate.bounds.max[0]) / 2, 2, plate.requestArea!.min[2]]} priority={90} kind="request-owner">{plate.requestCount} {plate.id === "unknown" ? "unowned" : "owned"} request{plate.requestCount === 1 ? "" : "s"}{plate.earlierCount ? ` · ${plate.earlierCount} outside window` : ""}{plate.lanes.length === 0 && plate.id !== "unknown" ? " · owner hidden" : ""}</ScreenLabel>)}
    {layout.buildings.map((building) => <ScreenLabel key={building.lane} id={`system-lane-${building.lane}`} position={[building.anchor[0], building.anchor[1] + (preset === "side" ? 18 : 8), building.anchor[2]]} priority={model.lanes[building.lane].meta.kind === "main" ? 110 : 50}>
      {threadLabel(model.lanes[building.lane].meta)}<br />
      {building.busy > 0 ? `${formatMs(building.busy)} · ${CATEGORIES[building.catId].label}` : "No work in this window"}
      {selection?.kind === "lane" && selection.lane === building.lane && !!routes.localCounts.get(building.lane) && <><br /><span className="system-label-domain">{routes.localCounts.get(building.lane)} local links</span></>}
    </ScreenLabel>)}
  </group>;
}

function SystemBuildings({ buildings, bounds, related, index, onHover }: {
  buildings: SystemBuilding[]; bounds: WorldBounds; related: Set<number> | null;
  index: ReturnType<typeof playbackIndex>; onHover: (building: SystemBuilding, event: ThreeEvent<PointerEvent>) => void;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const flags = useMemo(() => new Float32Array(Math.max(1, buildings.length)), [buildings.length]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    buildings.forEach((building, i) => {
      fillBox(mesh.current!, i, building.bounds);
      mesh.current!.setColorAt(i, CAT_COLORS[building.catId]);
    });
    uploadInstances(mesh.current, buildings.length, bounds);
  }, [buildings, bounds]);
  useFrame(() => {
    const attribute = mesh.current?.geometry.getAttribute("systemState") as InstancedBufferAttribute | undefined;
    if (!attribute) return;
    const time = useAppStore.getState().playhead;
    buildings.forEach((building, i) => {
      const tasks = index.tasks.find((task) => task.lane === building.lane);
      const active = time === null || !tasks ? null : activeIntervals(tasks.index, time)[0];
      attribute.setX(i, related && !related.has(building.lane) ? -1 : active ? 1 : 0);
    });
    attribute.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} name="system-buildings" args={[undefined, undefined, Math.max(1, buildings.length)]} count={buildings.length}
    userData={{ lanes: buildings.map((building) => building.lane) }}
    onPointerMove={(event) => { const building = buildings[event.instanceId ?? -1]; if (building) { event.stopPropagation(); onHover(building, event); } }}
    onPointerOut={() => useHoverStore.getState().setHover(null)}
    onClick={(event) => { const building = buildings[event.instanceId ?? -1]; if (building && event.delta <= 4) { event.stopPropagation(); useAppStore.getState().setSelection({ kind: "lane", lane: building.lane }); } }}>
    <boxGeometry><instancedBufferAttribute attach="attributes-systemState" args={[flags, 1]} /></boxGeometry>
    <SystemMaterial />
  </instancedMesh>;
}

function SystemMaterial() {
  const compile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = `attribute float systemState; varying float vSystemState; varying vec2 vSystemUv; varying vec3 vSystemNormal;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSystemState = systemState; vSystemUv = uv; vSystemNormal = normal;");
    shader.fragmentShader = `varying float vSystemState; varying vec2 vSystemUv; varying vec3 vSystemNormal;\n${shader.fragmentShader}`
      .replace("#include <opaque_fragment>", `
        vec2 edgeDistance = min(vSystemUv, 1.0 - vSystemUv) / max(fwidth(vSystemUv), vec2(0.00001));
        float edge = 1.0 - smoothstep(0.5, 1.5, min(edgeDistance.x, edgeDistance.y));
        float shade = abs(vSystemNormal.y) > 0.5 ? 1.0 : (abs(vSystemNormal.x) > 0.5 ? 0.78 : 0.64);
        vec3 body = outgoingLight * shade;
        if (vSystemState < -0.5 && edge < 0.1) discard;
        vec3 border = vSystemState > 0.5 ? vec3(0.92) : vSystemState < -0.5 ? vec3(0.08) : body * 0.45;
        outgoingLight = mix(body, border, edge);
        #include <opaque_fragment>`);
  };
  return <meshBasicMaterial fog={false} toneMapped={false} onBeforeCompile={compile} customProgramCacheKey={() => "system-building-v2"} />;
}

function SystemBoxes({ name, boxes, bounds, onHover, onSelect, color: hex }: {
  name: string; boxes: WorldBounds[]; bounds: WorldBounds; color?: string;
  onHover?: (index: number, event: ThreeEvent<PointerEvent>) => void; onSelect?: (index: number) => void;
}) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const color = hex ? new Color(hex) : name === "system-plates" ? new Color("#252a32") : CAT_COLORS[CAT_ID.loading];
    boxes.forEach((box, i) => { fillBox(mesh.current!, i, box); mesh.current!.setColorAt(i, color); });
    uploadInstances(mesh.current, boxes.length, bounds);
  }, [boxes, bounds, name, hex]);
  return <instancedMesh ref={mesh} name={name} args={[undefined, undefined, Math.max(1, boxes.length)]} count={boxes.length}
    onPointerMove={(event) => { if (onHover && event.instanceId !== undefined) { event.stopPropagation(); onHover(event.instanceId, event); } }}
    onPointerOut={() => { if (onHover) useHoverStore.getState().setHover(null); }}
    onClick={(event) => { if (onSelect && event.instanceId !== undefined && event.delta <= 4) { event.stopPropagation(); onSelect(event.instanceId); } }}>
    <boxGeometry /><DataMaterial />
  </instancedMesh>;
}

function fillBox(mesh: InstancedMesh, i: number, { min, max }: WorldBounds) {
  writeBox(mesh, i, (min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2, max[0] - min[0], max[1] - min[1], max[2] - min[2]);
}
