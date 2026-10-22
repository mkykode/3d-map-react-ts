import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { ParsedTraceModel } from "../engine/types";
import { connectionInWindow } from "../engine/connections";
import { useAppStore, useHoverStore, windowOf } from "../state/store";
import { eventBounds, type LanePlacement } from "./traceLayout";
import type { RenderedLane } from "./renderedLane";
import { lowerBound } from "./picking";
import { ConnectionArcs } from "./ConnectionArcs";
import type { ConnectionArc } from "./connectionGeometry";
import { ScreenLabel } from "./ScreenLabels";

export function FlowArcs({ model, t0, t1, placements, rendered }: { model: ParsedTraceModel; t0: number; t1: number; placements: LanePlacement[]; rendered: Map<number, RenderedLane | undefined> }) {
  const selection = useAppStore((s) => s.selection);
  const enabled = useAppStore((s) => s.connectionsVisible);
  const brush = useAppStore((s) => s.brush);
  const graph = model.connections;
  const candidates = useMemo(() => {
    const [start, end] = windowOf(model, brush);
    const visible = new Set(placements.map((p) => p.lane.meta.id));
    return Array.from(graph.edgeIds).flatMap((id, i) => {
      const edge = graph.edges[id];
      const selected = selection?.kind === "entry" && edge.kind === "flow" && (edge.fromLane === selection.lane && graph.fromIdx[i] === selection.idx || edge.toLane === selection.lane && graph.toIdx[i] === selection.idx);
      return (enabled || selected) && visible.has(edge.fromLane) && visible.has(edge.toLane) && connectionInWindow(graph, i, start, end) ? [i] : [];
    });
  }, [model, graph, placements, brush, enabled, selection]);
  const previous = useRef<{ candidates: number[]; lanes: (RenderedLane | undefined)[] } | null>(null);
  const [arcs, setArcs] = useState<ConnectionArc[]>([]);
  useFrame(() => {
    const lanes = placements.map((placement) => rendered.get(placement.lane.meta.id));
    if (previous.current?.candidates === candidates && lanes.every((lane, i) => lane === previous.current?.lanes[i])) return;
    previous.current = { candidates, lanes };
    const result: ConnectionArc[] = [];
    const endpoint = (laneId: number, index: number) => {
      const placement = placements.find((p) => p.lane.meta.id === laneId);
      const lane = rendered.get(laneId);
      if (!placement || !lane || index < 0) return null;
      const level = lane.index.byDepth[placement.lane.depths[index]];
      if (!level) return null;
      const start = Math.max(t0, placement.lane.starts[index]);
      const offset = lowerBound(level.starts, start + 1e-7) - 1;
      const spanIndex = level.indices[offset];
      const span = lane.spans[spanIndex];
      if (!span || span.end <= start || placement.lane.starts[index] >= t1) return null;
      const bounds = eventBounds({ ...placement, lane: lane.geometry }, spanIndex, t0, t1);
      return bounds ? { point: [(bounds.min[0] + bounds.max[0]) / 2, bounds.max[1], (bounds.min[2] + bounds.max[2]) / 2] as const, aggregate: span.count > 1 } : null;
    };
    for (const instance of candidates) {
      const edge = graph.edges[graph.edgeIds[instance]];
      const from = endpoint(edge.fromLane, graph.fromIdx[instance]), to = endpoint(edge.toLane, graph.toIdx[instance]);
      if (!from || !to) continue;
      result.push({ id: instance, from: from.point, to: to.point, count: 1, provenance: edge.provenance, aggregate: from.aggregate || to.aggregate });
      if (result.length === 200) break;
    }
    setArcs(result);
  });
  return <>
    <ConnectionArcs arcs={arcs} onSelect={(arc) => useAppStore.getState().setSelection({ kind: "connection", edge: graph.edgeIds[arc.id] })} onHover={(arc, event) => {
      if (!arc) { useHoverStore.getState().setHover(null); return; }
      const edge = graph.edges[graph.edgeIds[arc.id]];
      useHoverStore.getState().setHover({ source: "connection", idx: arc.id, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY, summary: {
        title: `${model.lanes[edge.fromLane].meta.name} → ${model.lanes[edge.toLane].meta.name}`, catId: 0,
        detail: `${edge.provenance} ${edge.kind} link · ${graph.starts[arc.id].toFixed(2)} to ${graph.ends[arc.id].toFixed(2)} ms${arc.aggregate ? ". Endpoint is an aggregate at this zoom." : ""}`,
      } });
    }} />
    {enabled && <ScreenLabel id="canyon-connection-count" position={[80, 30, 0]} priority={100}>{arcs.length} of {candidates.length} links shown</ScreenLabel>}
  </>;
}
