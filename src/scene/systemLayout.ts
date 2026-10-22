import { bottomUp, bucketize } from "../engine/aggregate";
import { CAT_ID } from "../engine/categories";
import { connectionsInWindow } from "../engine/connections";
import type { ParsedTraceModel } from "../engine/types";
import type { ScaleMode } from "../state/store";
import type { TraceSelection, Vector3Tuple, WorldBounds } from "./cameraActions";
import { scaleHeight } from "./layout";

export interface SystemBuilding {
  lane: number;
  busy: number;
  catId: number;
  activities: ReturnType<typeof bottomUp>;
  incoming: number;
  outgoing: number;
  bounds: WorldBounds;
  anchor: Vector3Tuple;
}
export interface SystemPlate { id: string; label: string; bounds: WorldBounds }

export function systemLayout(model: ParsedTraceModel, hidden: ReadonlySet<number>, t0: number, t1: number, scale: ScaleMode = "linear") {
  const links = connectionsInWindow(model.connections, t0, t1, hidden);
  const visible = model.lanes.filter((lane) => !hidden.has(lane.meta.id));
  const groups = new Map<string, typeof visible>();
  for (const lane of visible) {
    const key = lane.meta.kind === "network" || lane.meta.kind === "gpu" ? lane.meta.kind : `process-${lane.meta.processId ?? lane.meta.id}`;
    const group = groups.get(key) ?? [];
    group.push(lane);
    groups.set(key, group);
  }
  const categories = bucketize(visible, t0, t1, 1);
  const summaries = new Map(visible.map((lane, i) => {
    const activities = bottomUp([lane], t0, t1);
    const busy = activities.reduce((sum, row) => sum + row.self, 0);
    return [lane.meta.id, { activities, busy, catId: busy > 0 ? categories.lanes[i].dominantCat[0] : CAT_ID.system }];
  }));
  const maxBusy = Math.max(1, ...visible.filter((lane) => lane.meta.kind !== "network").map((lane) => summaries.get(lane.meta.id)!.busy));
  const plates: SystemPlate[] = [];
  const buildings: SystemBuilding[] = [];
  const requests: { index: number; bounds: WorldBounds }[] = [];
  const anchors = new Map<number, Vector3Tuple>();
  let z = 0;
  let rowDepth = 0;
  let ordinal = 0;
  for (const [id, lanes] of groups) {
    const x = ordinal % 3 * 52;
    if (ordinal > 0 && ordinal % 3 === 0) { z += rowDepth + 12; rowDepth = 0; }
    const network = id === "network";
    const inWindow = network ? model.requests.flatMap((request, index) => request.start < t1 && request.end > t0 ? [index] : []) : [];
    const depth = network ? Math.max(28, 12 + Math.ceil(inWindow.length / 10) * 3) : Math.max(28, 12 + Math.ceil(lanes.length / 3) * 12);
    rowDepth = Math.max(rowDepth, depth);
    const process = model.processes.find((process) => process.id === lanes[0].meta.processId);
    let label = network ? "Request rack" : id === "gpu" ? "GPU" : `Process ${lanes[0].meta.processId ?? lanes[0].meta.id}`;
    if (!network && id !== "gpu" && process?.url) {
      try { label = new URL(process.url).host || process.url; } catch { label = process.url; }
    }
    plates.push({ id, label, bounds: { min: [x, 0, z], max: [x + 46, 0.8, z + depth] } });
    lanes.forEach((lane, i) => {
      const summary = summaries.get(lane.meta.id)!;
      const height = Math.max(1.5, scaleHeight(summary.busy, maxBusy, 18, scale));
      const cx = network ? x + 23 : x + 9 + i % 3 * 14;
      const cz = network ? z + depth / 2 : z + 11 + Math.floor(i / 3) * 12;
      const width = lane.meta.kind === "main" ? 10 : 7;
      const bounds: WorldBounds = { min: [cx - width / 2, 0.8, cz - 4], max: [cx + width / 2, 0.8 + height, cz + 4] };
      const anchor: Vector3Tuple = network ? [cx, 3, cz] : [cx, bounds.max[1], cz];
      anchors.set(lane.meta.id, anchor);
      let incoming = 0, outgoing = 0;
      model.connections.edges.forEach((edge, edgeIndex) => {
        if (edge.fromLane === lane.meta.id) outgoing += links.counts[edgeIndex];
        if (edge.toLane === lane.meta.id) incoming += links.counts[edgeIndex];
      });
      if (!network) buildings.push({ lane: lane.meta.id, ...summary, incoming, outgoing, bounds, anchor });
    });
    inWindow.forEach((index, i) => requests.push({ index, bounds: { min: [x + 3 + i % 10 * 4, 0.8, z + 8 + Math.floor(i / 10) * 3], max: [x + 6 + i % 10 * 4, 2.4, z + 10 + Math.floor(i / 10) * 3] } }));
    ordinal++;
  }
  const bounds: WorldBounds = { min: [-3, 0, -3], max: [Math.min(3, groups.size) * 52 - 3, 38, Math.max(28, z + rowDepth + 3)] };
  return { plates, buildings, requests, anchors, links, bounds };
}

export function connectedLanes(model: ParsedTraceModel, selection: TraceSelection | null): Set<number> | null {
  if (!selection) return null;
  if (selection.kind === "connection") {
    const edge = model.connections.edges[selection.edge];
    return edge ? new Set([edge.fromLane, edge.toLane]) : null;
  }
  if (selection.kind !== "lane" && selection.kind !== "entry") return null;
  const lanes = new Set([selection.lane]);
  for (const edge of model.connections.edges) {
    if (edge.fromLane === selection.lane) lanes.add(edge.toLane);
    if (edge.toLane === selection.lane) lanes.add(edge.fromLane);
  }
  return lanes;
}
