import type { ConnectionGraph } from "./types";

export interface ConnectionEndpoint {
  lane: number | null;
  idx: number;
  start: number;
}

export interface ConnectionInput {
  from: ConnectionEndpoint;
  to: ConnectionEndpoint;
  kind: ConnectionGraph["edges"][number]["kind"];
  provenance: ConnectionGraph["edges"][number]["provenance"];
}

export interface ResourceEndpoint extends ConnectionEndpoint { url: string }

export function consumerConnections(requests: readonly ResourceEndpoint[], consumers: readonly ResourceEndpoint[]): ConnectionInput[] {
  const byUrl = new Map<string, ResourceEndpoint[]>();
  for (const request of requests) {
    if (!request.url) continue;
    const matches = byUrl.get(request.url) ?? [];
    matches.push(request); byUrl.set(request.url, matches);
  }
  for (const matches of byUrl.values()) matches.sort((a, b) => a.start - b.start);
  return consumers.flatMap((consumer) => {
    const matches = byUrl.get(consumer.url);
    if (!matches) return [];
    let lo = 0, hi = matches.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (matches[mid].start < consumer.start) lo = mid + 1; else hi = mid; }
    const request = matches[lo - 1];
    return request ? [{ from: request, to: consumer, kind: "consumer", provenance: "derived" }] : [];
  });
}

/** Receives normalized millisecond evidence, never trace_engine objects. */
export function buildConnections(inputs: readonly ConnectionInput[]): ConnectionGraph {
  const edges: ConnectionGraph["edges"] = [];
  const edgeByKey = new Map<string, number>();
  const recordedPairs = new Set(inputs.filter((link) => link.kind === "flow").map(pairKey));
  const seen = new Set<string>();
  const instances: { edge: number; start: number; end: number; from: number; to: number }[] = [];
  let unplaced = 0;
  for (const link of inputs) {
    const pair = pairKey(link);
    if (link.kind === "initiator" && recordedPairs.has(pair)) continue;
    const key = `${link.kind}:${pair}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (link.from.lane === null || link.to.lane === null) { unplaced++; continue; }
    const edgeKey = `${link.from.lane}:${link.to.lane}:${link.kind}:${link.provenance}`;
    let edge = edgeByKey.get(edgeKey);
    if (edge === undefined) {
      edge = edges.length;
      edgeByKey.set(edgeKey, edge);
      edges.push({ fromLane: link.from.lane, toLane: link.to.lane, kind: link.kind, provenance: link.provenance });
    }
    instances.push({ edge, start: link.from.start, end: link.to.start, from: link.from.idx, to: link.to.idx });
  }
  instances.sort((a, b) => a.start - b.start || a.end - b.end || a.edge - b.edge || a.from - b.from || a.to - b.to);
  return {
    edges,
    edgeIds: Uint32Array.from(instances, (i) => i.edge),
    starts: Float64Array.from(instances, (i) => i.start),
    ends: Float64Array.from(instances, (i) => i.end),
    fromIdx: Int32Array.from(instances, (i) => i.from),
    toIdx: Int32Array.from(instances, (i) => i.to),
    unplaced,
  };
}

function pairKey({ from, to }: ConnectionInput): string {
  return `${from.lane}:${from.idx}:${from.start}>${to.lane}:${to.idx}:${to.start}`;
}

/** Interval intersection includes instantaneous links at the window start. */
export function connectionInWindow(graph: ConnectionGraph, index: number, t0: number, t1: number): boolean {
  const start = Math.min(graph.starts[index], graph.ends[index]);
  const end = Math.max(graph.starts[index], graph.ends[index]);
  return start < t1 && (end > t0 || start === end && start >= t0);
}

export function connectionsInWindow(graph: ConnectionGraph, t0: number, t1: number, hidden: ReadonlySet<number>) {
  const counts = new Uint32Array(graph.edges.length);
  const instances: number[][] = graph.edges.map(() => []);
  for (let i = 0; i < graph.edgeIds.length; i++) {
    const id = graph.edgeIds[i];
    const edge = graph.edges[id];
    if (hidden.has(edge.fromLane) || hidden.has(edge.toLane) || !connectionInWindow(graph, i, t0, t1)) continue;
    counts[id]++;
    instances[id].push(i);
  }
  return { counts, instances };
}
