import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Color, InstancedBufferAttribute, InstancedMesh, type WebGLProgramParametersWithUniforms } from "three";
import type { ParsedTraceModel } from "../engine/types";
import { activeIntervals, playbackIndex } from "../engine/moments";
import { threadDefinition } from "../evidence/definitions";
import { useAppStore, useHoverStore, windowOf } from "../state/store";
import { CAT_COLORS, formatMs } from "./layout";
import { writeBox, uploadInstances } from "./instanceBuffers";
import { connectedLanes, systemLayout, type SystemBuilding } from "./systemLayout";
import { ConnectionArcs } from "./ConnectionArcs";
import { ConnectionPackets } from "./ConnectionPackets";
import type { ConnectionArc } from "./connectionGeometry";
import { ScreenLabel } from "./ScreenLabels";
import type { WorldBounds } from "./cameraActions";

export function SystemScene({ model }: { model: ParsedTraceModel }) {
  const brush = useAppStore((state) => state.brush);
  const hidden = useAppStore((state) => state.hiddenLanes);
  const scale = useAppStore((state) => state.scale);
  const selection = useAppStore((state) => state.selection);
  const [t0, t1] = windowOf(model, brush);
  const layout = useMemo(() => systemLayout(model, hidden, t0, t1, scale), [model, hidden, t0, t1, scale]);
  const related = useMemo(() => connectedLanes(model, selection), [model, selection]);
  const index = useMemo(() => playbackIndex(model), [model]);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => useAppStore.subscribe((state, previous) => { if (state.playhead !== previous.playhead) invalidate(); }), [invalidate]);
  const arcs = useMemo<ConnectionArc[]>(() => model.connections.edges.flatMap((edge, id) => {
    const from = layout.anchors.get(edge.fromLane), to = layout.anchors.get(edge.toLane);
    if (!from || !to || !layout.links.counts[id]) return [];
    const dim = selection?.kind === "connection" ? selection.edge !== id : selection?.kind === "lane" || selection?.kind === "entry" ? edge.fromLane !== selection.lane && edge.toLane !== selection.lane : false;
    return [{ id, from, to, count: layout.links.counts[id], provenance: edge.provenance, dim }];
  }), [model, layout, selection]);
  const hoverBuilding = (building: SystemBuilding, event: ThreeEvent<PointerEvent>) => {
    const lane = model.lanes[building.lane];
    useHoverStore.getState().setHover({ source: "system", idx: building.lane, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY,
      summary: { title: lane.meta.name, catId: building.activities[0]?.catId ?? 0,
        detail: `${formatMs(building.busy)} busy · ${building.incoming} links in · ${building.outgoing} links out. Top activities: ${building.activities.slice(0, 3).map((row) => `${model.names[row.nameId]} ${formatMs(row.self)}`).join(", ") || "None in this window"}.`, definition: threadDefinition(lane.meta) } });
  };
  return <group name="system-board">
    <SystemBoxes name="system-plates" boxes={layout.plates.map((plate) => plate.bounds)} bounds={layout.bounds} />
    <SystemBuildings model={model} buildings={layout.buildings} bounds={layout.bounds} related={related} index={index} onHover={hoverBuilding} />
    <SystemBoxes name="system-requests" boxes={layout.requests.map((request) => request.bounds)} bounds={layout.bounds}
      onHover={(i, event) => {
        const request = model.requests[layout.requests[i].index];
        useHoverStore.getState().setHover({ source: "system", idx: i, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY,
          summary: { title: request.url, catId: 1, detail: `${formatMs(request.start)} to ${formatMs(request.end)} · ${request.initiatorType ?? "Initiator not recorded"}` } });
      }}
      onSelect={(i) => {
        const lane = model.lanes.find((lane) => lane.meta.kind === "network");
        if (lane) useAppStore.getState().setSelection({ kind: "entry", lane: lane.meta.id, idx: layout.requests[i].index });
      }} />
    <ConnectionArcs arcs={arcs} onSelect={(arc) => useAppStore.getState().setSelection({ kind: "connection", edge: arc.id })}
      onHover={(arc, event) => {
        if (!arc) { useHoverStore.getState().setHover(null); return; }
        const edge = model.connections.edges[arc.id];
        useHoverStore.getState().setHover({ source: "connection", idx: arc.id, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY,
          summary: { title: `${model.lanes[edge.fromLane].meta.name} → ${model.lanes[edge.toLane].meta.name}`, catId: 0,
            detail: `${arc.count} ${edge.provenance} links · ${edge.kind}${edge.kind === "consumer" ? ". URL match: latest request started before the consumer." : ""}` } });
      }} />
    <ConnectionPackets model={model} arcs={arcs} index={index} anchors={layout.anchors} />
    {layout.plates.map((plate) => <ScreenLabel key={plate.id} id={`system-${plate.id}`} position={[plate.bounds.min[0] + 23, 1.2, plate.bounds.min[2] + 2]} priority={90} kind="district">{plate.label}</ScreenLabel>)}
    {layout.buildings.map((building) => <ScreenLabel key={building.lane} id={`system-lane-${building.lane}`} position={[building.anchor[0], building.anchor[1] + 1.5, building.anchor[2]]} priority={50}>
      {model.lanes[building.lane].meta.name.split(" — ")[0]} · {formatMs(building.busy)}
    </ScreenLabel>)}
  </group>;
}

function SystemBuildings({ model, buildings, bounds, related, index, onHover }: {
  model: ParsedTraceModel; buildings: SystemBuilding[]; bounds: WorldBounds; related: Set<number> | null;
  index: ReturnType<typeof playbackIndex>; onHover: (building: SystemBuilding, event: ThreeEvent<PointerEvent>) => void;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const flags = useMemo(() => new Float32Array(Math.max(1, buildings.length)), [buildings.length]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    buildings.forEach((building, i) => {
      fillBox(mesh.current!, i, building.bounds);
      mesh.current!.setColorAt(i, CAT_COLORS[building.activities[0]?.catId ?? 0]);
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
      if (mesh.current) mesh.current.setColorAt(i, CAT_COLORS[active ? model.lanes[building.lane].catIds[active.idx] : building.activities[0]?.catId ?? 0]);
    });
    attribute.needsUpdate = true;
    if (mesh.current?.instanceColor) mesh.current.instanceColor.needsUpdate = true;
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
        vec3 body = vec3(0.018, 0.021, 0.027);
        if (vSystemState < -0.5 && edge < 0.1) discard;
        if (vSystemState > 0.5 && vSystemNormal.y > 0.5) body = outgoingLight;
        outgoingLight = mix(body, vec3(vSystemState > 0.5 ? 0.92 : vSystemState < -0.5 ? 0.08 : 0.26), edge);
        #include <opaque_fragment>`);
  };
  return <meshBasicMaterial fog={false} toneMapped={false} onBeforeCompile={compile} customProgramCacheKey={() => "system-building-v1"} />;
}

function SystemBoxes({ name, boxes, bounds, onHover, onSelect }: {
  name: string; boxes: WorldBounds[]; bounds: WorldBounds;
  onHover?: (index: number, event: ThreeEvent<PointerEvent>) => void; onSelect?: (index: number) => void;
}) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    boxes.forEach((box, i) => { fillBox(mesh.current!, i, box); mesh.current!.setColorAt(i, new Color(name === "system-plates" ? "#252a32" : "#737d89")); });
    uploadInstances(mesh.current, boxes.length, bounds);
  }, [boxes, bounds, name]);
  return <instancedMesh ref={mesh} name={name} args={[undefined, undefined, Math.max(1, boxes.length)]} count={boxes.length}
    onPointerMove={(event) => { if (onHover && event.instanceId !== undefined) { event.stopPropagation(); onHover(event.instanceId, event); } }}
    onPointerOut={() => { if (onHover) useHoverStore.getState().setHover(null); }}
    onClick={(event) => { if (onSelect && event.instanceId !== undefined && event.delta <= 4) { event.stopPropagation(); onSelect(event.instanceId); } }}>
    <boxGeometry /><meshBasicMaterial fog={false} toneMapped={false} />
  </instancedMesh>;
}

function fillBox(mesh: InstancedMesh, i: number, { min, max }: WorldBounds) {
  writeBox(mesh, i, (min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2, max[0] - min[0], max[1] - min[1], max[2] - min[2]);
}
