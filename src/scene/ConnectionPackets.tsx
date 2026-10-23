import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { InstancedMesh } from "three";
import { playbackPackets, MAX_PACKETS, type PlaybackPacket, type playbackIndex } from "../engine/moments";
import type { ParsedTraceModel } from "../engine/types";
import { useReducedMotion } from "../lib/useReducedMotion";
import { useAppStore, useHoverStore } from "../state/store";
import { arcPoint, type ConnectionArc } from "./connectionGeometry";
import { writeBox } from "./instanceBuffers";
import { INK } from "./layout";
import { SCENE_DEBUG } from "./diagnostics";
import type { Vector3Tuple } from "./cameraActions";

export function ConnectionPackets({ model, arcs, index, anchors, requests }: { model: ParsedTraceModel; arcs: ConnectionArc[]; index: ReturnType<typeof playbackIndex>; anchors: Map<number, Vector3Tuple>; requests: ReadonlyMap<number, Vector3Tuple> }) {
  const mesh = useRef<InstancedMesh>(null);
  const reduced = useReducedMotion();
  const arcById = useMemo(() => new Map(arcs.map((arc) => [`${arc.id}:${arc.request ?? -1}`, arc])), [arcs]);
  const visible = useMemo(() => new Set(arcs.map((arc) => arc.id)), [arcs]);
  const network = model.lanes.find((lane) => lane.meta.kind === "network");
  const requestRoutes = useMemo(() => {
    const routes = new Map<number, ConnectionArc>();
    for (const [request, to] of requests) {
      const lane = model.requests[request].requesterLane;
      const from = lane === null ? null : anchors.get(lane);
      if (!from) continue;
      // This invisible route conveys request activity, not an asserted initiator link.
      routes.set(request, { id: model.connections.edges.length + request, from, to, count: 1, provenance: "recorded", lift: 7 });
    }
    return routes;
  }, [model, anchors, requests]);
  const requesters = useMemo(() => new Set([...requestRoutes.keys()].map((request) => model.requests[request].requesterLane!)), [model, requestRoutes]);
  const arcForPacket = (packet: PlaybackPacket) => {
    if (packet.kind === "request") return requestRoutes.get(packet.request);
    const edge = model.connections.edges[packet.edge];
    const request = edge.fromLane === network?.meta.id ? model.connections.fromIdx[packet.instance] : edge.toLane === network?.meta.id ? model.connections.toIdx[packet.instance] : -1;
    return arcById.get(`${packet.edge}:${request}`);
  };
  const current = useRef<ReturnType<typeof playbackPackets>["packets"]>([]);
  useFrame(() => {
    if (!mesh.current) return;
    const time = useAppStore.getState().playhead;
    const frame = time === null ? { packets: [], omitted: 0 } : playbackPackets(index, time, visible, requesters, (packet) => arcForPacket(packet) !== undefined);
    const placed = frame.packets.flatMap((packet) => {
      const arc = arcForPacket(packet);
      return arc ? [{ packet, arc }] : [];
    });
    current.current = placed.map(({ packet }) => packet);
    placed.forEach(({ packet, arc }, i) => {
      const progress = reduced ? 0.5 : ((time ?? 0) - packet.start) / (packet.end - packet.start);
      const point = arcPoint(arc, progress);
      writeBox(mesh.current!, i, ...point, 0.65, 0.65, 0.65);
    });
    mesh.current.count = placed.length;
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
    if (SCENE_DEBUG) { mesh.current.userData.omitted = frame.omitted + frame.packets.length - placed.length; mesh.current.userData.packets = current.current; }
  });
  return <instancedMesh ref={mesh} name="connection-packets" args={[undefined, undefined, MAX_PACKETS]} count={0} frustumCulled={false}
    onPointerMove={(event) => {
      const packet = current.current[event.instanceId ?? -1];
      if (!packet) return;
      event.stopPropagation();
      if (packet.kind === "request") {
        const request = model.requests[packet.request];
        useHoverStore.getState().setHover({ source: "connection", idx: packet.request, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY, summary: {
          title: request.url, catId: 0, detail: `Request activity · ${packet.start.toFixed(2)} to ${packet.end.toFixed(2)} ms. Recorded requesting frame: ${model.lanes[packet.requesterLane].meta.name}. ${request.initiatorType ? `Recorded initiator type: ${request.initiatorType}.` : "Initiator not recorded."}`,
        } });
        return;
      }
      const graph = model.connections, edge = graph.edges[packet.edge];
      const from = graph.fromIdx[packet.instance], to = graph.toIdx[packet.instance];
      const available = from >= 0 && to >= 0;
      useHoverStore.getState().setHover({ source: "connection", idx: packet.instance, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY, summary: {
        title: available ? `${model.names[model.lanes[edge.fromLane].nameIds[from]]} → ${model.names[model.lanes[edge.toLane].nameIds[to]]}` : "Endpoint not recorded", catId: 0,
        detail: `${packet.start.toFixed(2)} to ${packet.end.toFixed(2)} ms · ${edge.provenance} ${edge.kind} link`,
      } });
    }}
    onPointerOut={() => useHoverStore.getState().setHover(null)}
    onClick={(event) => {
      const packet = current.current[event.instanceId ?? -1];
      if (!packet || event.delta > 4) return;
      event.stopPropagation();
      if (packet.kind === "request") { if (network) useAppStore.getState().openInCanyon({ kind: "entry", lane: network.meta.id, idx: packet.request }); return; }
      const graph = model.connections, edge = graph.edges[packet.edge];
      if (graph.fromIdx[packet.instance] >= 0 && graph.toIdx[packet.instance] >= 0) useAppStore.getState().openInCanyon({ kind: "entry", lane: edge.fromLane, idx: graph.fromIdx[packet.instance] });
    }}>
    <sphereGeometry args={[1, 6, 4]} /><meshBasicMaterial color={INK} fog={false} toneMapped={false} />
  </instancedMesh>;
}
