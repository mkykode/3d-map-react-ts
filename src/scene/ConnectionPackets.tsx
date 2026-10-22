import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { InstancedMesh } from "three";
import { playbackPackets, MAX_PACKETS, type playbackIndex } from "../engine/moments";
import type { ParsedTraceModel } from "../engine/types";
import { useReducedMotion } from "../lib/useReducedMotion";
import { useAppStore, useHoverStore } from "../state/store";
import { arcPoint, type ConnectionArc } from "./connectionGeometry";
import { writeBox } from "./instanceBuffers";
import { INK } from "./layout";
import { SCENE_DEBUG } from "./diagnostics";
import type { Vector3Tuple } from "./cameraActions";

export function ConnectionPackets({ model, arcs, index, anchors }: { model: ParsedTraceModel; arcs: ConnectionArc[]; index: ReturnType<typeof playbackIndex>; anchors: Map<number, Vector3Tuple> }) {
  const mesh = useRef<InstancedMesh>(null);
  const reduced = useReducedMotion();
  const arcById = useMemo(() => new Map(arcs.map((arc) => [arc.id, arc])), [arcs]);
  const visible = useMemo(() => new Set(arcById.keys()), [arcById]);
  const network = model.lanes.find((lane) => lane.meta.kind === "network");
  const requestRoutes = useMemo(() => {
    const routes = new Map<number, ConnectionArc>();
    const to = network ? anchors.get(network.meta.id) : null;
    if (!to) return routes;
    for (const [lane, from] of anchors) {
      if (lane === network?.meta.id) continue;
      const recorded = arcs.find((arc) => model.connections.edges[arc.id].kind === "request" && model.connections.edges[arc.id].fromLane === lane);
      routes.set(lane, recorded ?? { id: model.connections.edges.length + lane, from, to, count: 1, provenance: "recorded" });
    }
    return routes;
  }, [model, network, anchors, arcs]);
  const requesters = useMemo(() => new Set(requestRoutes.keys()), [requestRoutes]);
  const current = useRef<ReturnType<typeof playbackPackets>["packets"]>([]);
  useFrame(() => {
    if (!mesh.current) return;
    const time = useAppStore.getState().playhead;
    const frame = time === null ? { packets: [], omitted: 0 } : playbackPackets(index, time, visible, requesters);
    current.current = frame.packets;
    frame.packets.forEach((packet, i) => {
      const arc = packet.kind === "request" ? requestRoutes.get(packet.requesterLane)! : arcById.get(packet.edge)!;
      const progress = reduced ? (i + 1) / (frame.packets.length + 1) : ((time ?? 0) - packet.start) / (packet.end - packet.start);
      const point = arcPoint(arc, progress);
      writeBox(mesh.current!, i, ...point, 0.65, 0.65, 0.65);
    });
    mesh.current.count = frame.packets.length;
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
    if (SCENE_DEBUG) { mesh.current.userData.omitted = frame.omitted; mesh.current.userData.packets = frame.packets; }
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
