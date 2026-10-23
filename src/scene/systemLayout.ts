import { bottomUp, bucketize } from "../engine/aggregate";
import { CAT_ID } from "../engine/categories";
import { connectionsInWindow } from "../engine/connections";
import type { ParsedTraceModel } from "../engine/types";
import type { ScaleMode } from "../state/store";
import type { TraceSelection, Vector3Tuple, WorldBounds } from "./cameraActions";
import { niceTickStep, scaleHeight } from "./layout";
import { componentContext, type ComponentContext } from "../evidence/systemContext";

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
export interface SystemPlate {
  id: string;
  label: string;
  context: ComponentContext;
  lanes: number[];
  bounds: WorldBounds;
  requestArea: WorldBounds | null;
  requestCount: number;
  earlierCount: number;
  infrastructure: boolean;
}
export interface SystemRequest { index: number; owner: string; bounds: WorldBounds; anchor: Vector3Tuple }
export const SYSTEM_WORK_HEIGHT = 32;
export const SYSTEM_FLOOR = 0.8;
const REGION_WIDTH = 64;
const REGION_GAP = 14;
const REQUEST_COLUMNS = 12;

function processKey(lane: ParsedTraceModel["lanes"][number]) {
  return lane.meta.kind === "gpu" ? "gpu" : `process-${lane.meta.processId ?? lane.meta.id}`;
}

/** The trace is immutable. Window and track changes never repack its ownership regions. */
const topologies = new WeakMap<ParsedTraceModel, ReturnType<typeof buildTopology>>();
function buildTopology(model: ParsedTraceModel) {
  const groups = new Map<string, number[]>();
  let maxBusy = 1;
  for (const lane of model.lanes) {
    if (lane.meta.kind === "network") continue;
    const key = processKey(lane);
    const lanes = groups.get(key) ?? [];
    lanes.push(lane.meta.id);
    groups.set(key, lanes);
    const busy = bottomUp([lane], 0, model.rangeMs).reduce((sum, row) => sum + row.self, 0);
    maxBusy = Math.max(maxBusy, busy);
  }
  const step = niceTickStep(maxBusy, 4);
  const heightMax = Math.ceil(maxBusy / step) * step;
  const requestsByOwner = new Map<string, number[]>();
  model.requests.forEach((request, index) => {
    const lane = request.requesterLane === null ? null : model.lanes[request.requesterLane];
    const owner = lane && lane.meta.kind !== "network" ? processKey(lane) : "unknown";
    const requests = requestsByOwner.get(owner) ?? [];
    requests.push(index);
    requestsByOwner.set(owner, requests);
  });
  if (requestsByOwner.has("unknown")) groups.set("unknown", []);
  const regions = [...groups].map(([id, lanes]) => {
    const context = lanes.length ? componentContext(model, lanes[0], 0, model.rangeMs) : {
      title: "Unknown requester", domain: "", description: "The trace does not identify the requesting thread.", relationship: "Ownership unavailable", basis: "", evidence: [],
    };
    const infrastructure = id === "gpu" || context.title === "Browser services" || !lanes.some((id) => model.lanes[id].meta.kind === "main");
    return { id, lanes, context, infrastructure };
  }).sort((a, b) => Number(a.infrastructure) - Number(b.infrastructure) || Number(b.context.title === "Your page") - Number(a.context.title === "Your page") || (a.lanes[0] ?? Infinity) - (b.lanes[0] ?? Infinity));
  const plates: SystemPlate[] = [];
  const placements = new Map<number, { x: number; z: number; width: number }>();
  const requests: SystemRequest[] = [];
  let pageColumn = 0, serviceColumn = 0, pageDepth = 0, serviceDepth = 0;
  for (const region of regions) {
    const column = region.infrastructure ? serviceColumn++ : pageColumn++;
    const x = column * (REGION_WIDTH + REGION_GAP);
    const supporting = region.lanes.filter((id) => model.lanes[id].meta.kind !== "main");
    const main = region.lanes.filter((id) => model.lanes[id].meta.kind === "main");
    const workDepth = Math.max(34, 14 + Math.ceil(supporting.length / 3) * 12, main.length * 16 + 12);
    const owned = requestsByOwner.get(region.id) ?? [];
    const depth = workDepth + (owned.length ? 14 + Math.ceil(owned.length / REQUEST_COLUMNS) * 4 : 4);
    // Browser services sit behind the page regions, separated by an ownership band.
    const z = region.infrastructure ? -depth - 22 : 0;
    if (region.infrastructure) serviceDepth = Math.max(serviceDepth, depth + 22);
    else pageDepth = Math.max(pageDepth, depth);
    main.forEach((id, i) => placements.set(id, { x: x + 12, z: z + 15 + i * 16, width: 10 }));
    supporting.forEach((id, i) => placements.set(id, { x: x + 32 + i % 3 * 11, z: z + 14 + Math.floor(i / 3) * 12, width: 7 }));
    const requestArea: WorldBounds | null = owned.length ? { min: [x + 4, SYSTEM_FLOOR, z + workDepth + 3], max: [x + REGION_WIDTH - 4, SYSTEM_FLOOR + 0.12, z + depth - 3] } : null;
    plates.push({ ...region, label: region.context.title, bounds: { min: [x, 0, z], max: [x + REGION_WIDTH, SYSTEM_FLOOR, z + depth] }, requestArea, requestCount: owned.length, earlierCount: 0 });
    owned.forEach((index, order) => {
      const rx = x + 6 + order % REQUEST_COLUMNS * 4.4, rz = z + workDepth + 7 + Math.floor(order / REQUEST_COLUMNS) * 4;
      const bounds: WorldBounds = { min: [rx, SYSTEM_FLOOR + 0.12, rz], max: [rx + 3.2, SYSTEM_FLOOR + 1.3, rz + 2.6] };
      requests.push({ index, owner: region.id, bounds, anchor: [rx + 1.6, bounds.max[1], rz + 1.3] });
    });
  }
  requests.sort((a, b) => a.index - b.index);
  const bounds: WorldBounds = { min: [-28, 0, -serviceDepth - 8], max: [Math.max(1, pageColumn, serviceColumn) * (REGION_WIDTH + REGION_GAP) - REGION_GAP + 8, SYSTEM_WORK_HEIGHT + 14, pageDepth + 14] };
  return { plates, placements, requests, bounds, heightMax };
}

export function systemLayout(model: ParsedTraceModel, hidden: ReadonlySet<number>, t0: number, t1: number, scale: ScaleMode = "linear") {
  const links = connectionsInWindow(model.connections, t0, t1, hidden);
  let topology = topologies.get(model);
  if (!topology) { topology = buildTopology(model); topologies.set(model, topology); }
  const visible = model.lanes.filter((lane) => lane.meta.kind !== "network" && !hidden.has(lane.meta.id));
  const categories = bucketize(visible, t0, t1, 1);
  const summaries = new Map(visible.map((lane, i) => {
    const activities = bottomUp([lane], t0, t1);
    const busy = activities.reduce((sum, row) => sum + row.self, 0);
    return [lane.meta.id, { activities, busy, catId: busy > 0 ? categories.lanes[i].dominantCat[0] : CAT_ID.system }];
  }));
  const buildings: SystemBuilding[] = [];
  const anchors = new Map<number, Vector3Tuple>();
  for (const lane of visible) {
      const summary = summaries.get(lane.meta.id)!;
      const height = scaleHeight(summary.busy, topology.heightMax, SYSTEM_WORK_HEIGHT, scale);
      const { x: cx, z: cz, width } = topology.placements.get(lane.meta.id)!;
      const bounds: WorldBounds = { min: [cx - width / 2, SYSTEM_FLOOR, cz - 4], max: [cx + width / 2, SYSTEM_FLOOR + height, cz + 4] };
      const anchor: Vector3Tuple = [cx, bounds.max[1], cz];
      anchors.set(lane.meta.id, anchor);
      let incoming = 0, outgoing = 0;
      model.connections.edges.forEach((edge, edgeIndex) => {
        if (edge.fromLane === lane.meta.id) outgoing += links.counts[edgeIndex];
        if (edge.toLane === lane.meta.id) incoming += links.counts[edgeIndex];
      });
      buildings.push({ lane: lane.meta.id, ...summary, incoming, outgoing, bounds, anchor });
  }
  const network = model.lanes.find((lane) => lane.meta.kind === "network");
  const linkedRequests = new Set<number>();
  if (network) model.connections.edges.forEach((edge, id) => {
    if (edge.fromLane !== network.meta.id && edge.toLane !== network.meta.id) return;
    for (const instance of links.instances[id]) linkedRequests.add(edge.fromLane === network.meta.id ? model.connections.fromIdx[instance] : model.connections.toIdx[instance]);
  });
  const requests = !network || hidden.has(network.meta.id) ? [] : topology.requests.filter(({ index }) => linkedRequests.has(index) || model.requests[index].start < t1 && model.requests[index].end > t0);
  const counts = new Map<string, number>();
  const earlier = new Map<string, number>();
  for (const request of requests) {
    counts.set(request.owner, (counts.get(request.owner) ?? 0) + 1);
    const timing = model.requests[request.index];
    if (!(timing.start < t1 && timing.end > t0)) earlier.set(request.owner, (earlier.get(request.owner) ?? 0) + 1);
  }
  const plates = topology.plates.filter((plate) => plate.lanes.some((id) => !hidden.has(id)) || counts.has(plate.id)).map((plate) => ({ ...plate, lanes: plate.lanes.filter((id) => !hidden.has(id)), requestCount: counts.get(plate.id) ?? 0, earlierCount: earlier.get(plate.id) ?? 0 }));
  return { plates, buildings, requests, anchors, links, bounds: topology.bounds, heightMax: topology.heightMax };
}

export function connectedLanes(model: ParsedTraceModel, selection: TraceSelection | null): Set<number> | null {
  if (!selection) return null;
  if (selection.kind === "entry" && model.lanes[selection.lane]?.meta.kind === "network") {
    const lanes = new Set([selection.lane]);
    const owner = model.requests[selection.idx]?.requesterLane;
    if (owner !== null && owner !== undefined) lanes.add(owner);
    const graph = model.connections;
    for (let i = 0; i < graph.edgeIds.length; i++) {
      const edge = graph.edges[graph.edgeIds[i]];
      if (edge.fromLane === selection.lane && graph.fromIdx[i] === selection.idx) lanes.add(edge.toLane);
      if (edge.toLane === selection.lane && graph.toIdx[i] === selection.idx) lanes.add(edge.fromLane);
    }
    return lanes;
  }
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

/** Fit the selected participant's ownership region so small request tiles retain context. */
export function systemSelectionBounds(model: ParsedTraceModel, layout: ReturnType<typeof systemLayout>, selection: TraceSelection | null): WorldBounds | null {
  if (!selection || (selection.kind !== "lane" && selection.kind !== "entry")) return null;
  const building = layout.buildings.find((building) => building.lane === selection.lane);
  const request = selection.kind === "entry" && model.lanes[selection.lane]?.meta.kind === "network" ? layout.requests.find((request) => request.index === selection.idx) : null;
  const plate = layout.plates.find((plate) => building ? plate.lanes.includes(building.lane) : plate.id === request?.owner);
  if (!plate) return null;
  const height = layout.buildings.reduce((max, building) => plate.lanes.includes(building.lane) ? Math.max(max, building.bounds.max[1]) : max, 3);
  return { min: [plate.bounds.min[0] - 8, 0, plate.bounds.min[2] - 8], max: [plate.bounds.max[0] + 8, height + 12, plate.bounds.max[2] + 18] };
}
