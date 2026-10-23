import type { ParsedTraceModel } from "../engine/types";
import type { TraceSelection } from "./cameraActions";
import type { ConnectionArc } from "./connectionGeometry";
import type { systemLayout } from "./systemLayout";

export const MAX_SYSTEM_ROUTES = 200;

/** Separate resource endpoints without changing the evidence graph's grouped identities. */
export function systemConnections(model: ParsedTraceModel, layout: ReturnType<typeof systemLayout>, selection: TraceSelection | null) {
  const network = model.lanes.find((lane) => lane.meta.kind === "network")?.meta.id;
  const requests = new Map(layout.requests.map((request) => [request.index, request.anchor]));
  const result: ConnectionArc[] = [];
  const localCounts = new Map<number, number>();
  model.connections.edges.forEach((edge, id) => {
    const count = layout.links.counts[id];
    if (!count) return;
    const selected = selection?.kind === "connection" ? selection.edge === id
      : selection?.kind === "lane" || selection?.kind === "entry" ? edge.fromLane === selection.lane || edge.toLane === selection.lane : true;
    if (edge.fromLane === network || edge.toLane === network) {
      // Owned tiles explain the overview. Expand resource routes only for an explicit selection.
      if (!selection || !selected) return;
      const counts = new Map<number, number>();
      for (const instance of layout.links.instances[id]) {
        const request = edge.fromLane === network ? model.connections.fromIdx[instance] : model.connections.toIdx[instance];
        counts.set(request, (counts.get(request) ?? 0) + 1);
      }
      for (const [request, count] of counts) {
        const from = edge.fromLane === network ? requests.get(request) : layout.anchors.get(edge.fromLane);
        const to = edge.toLane === network ? requests.get(request) : layout.anchors.get(edge.toLane);
        if (!from || !to) continue;
        const resourceSelected = selection?.kind === "entry" && selection.lane === network ? selection.idx === request : selected;
        if (!resourceSelected) continue;
        result.push({ id, request, from, to, count, provenance: edge.provenance, dim: !resourceSelected, lift: 5 + id % 3 * 2 });
      }
      return;
    }
    const from = layout.anchors.get(edge.fromLane), to = layout.anchors.get(edge.toLane);
    if (!from || !to) return;
    const local = edge.fromLane === edge.toLane;
    if (local) localCounts.set(edge.fromLane, (localCounts.get(edge.fromLane) ?? 0) + count);
    const expanded = local && !!selection && selected;
    result.push({ id, from, to, count, provenance: edge.provenance, dim: !selected,
      ...(local ? { lift: expanded ? 6 : 1.5 + id % 3, loopRadius: expanded ? 7 : 2 + id % 3 } : {}),
    });
  });
  result.sort((a, b) => Number(a.dim) - Number(b.dim) || b.count - a.count || a.id - b.id || (a.request ?? -1) - (b.request ?? -1));
  return { arcs: result.slice(0, MAX_SYSTEM_ROUTES), omitted: Math.max(0, result.length - MAX_SYSTEM_ROUTES), localCounts };
}
