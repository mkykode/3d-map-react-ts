import type { Finding } from "../domain/analysis";
import type { ColumnarLane, ParsedTraceModel } from "./types";

export interface TraceMoment { time: number; labels: string[] }

export function traceMoments(model: ParsedTraceModel, window: readonly [number, number], findings: readonly Finding[] = []): TraceMoment[] {
  const byTime = new Map<number, string[]>();
  const add = (time: number, label: string) => {
    if (time < window[0] || time > window[1]) return;
    const labels = byTime.get(time) ?? [];
    if (!labels.includes(label)) labels.push(label);
    byTime.set(time, labels);
  };
  for (const nav of model.navigations) add(nav.start, "Navigation start");
  if (model.requests.length) add(model.requests[0].start, "First request");
  for (const marker of model.markers) if (["Nav", "FCP", "LCP"].includes(marker.label)) add(marker.ts, marker.label);
  for (const lane of model.lanes) {
    if (lane.meta.kind !== "main") continue;
    for (let i = 0; i < lane.starts.length; i++) if (lane.parentIndexes[i] === -1 && lane.durs[i] >= 50) {
      add(lane.starts[i], `${model.names[lane.nameIds[i]]}: ${lane.durs[i].toFixed(1)} ms`);
    }
  }
  // Findings summarize an analysis window, not a causal instant.
  for (const finding of findings) add(window[0], `Finding for this window: ${finding.title}`);
  return [...byTime].sort(([a], [b]) => a - b).map(([time, labels]) => ({ time, labels }));
}

export function adjacentMoment(moments: readonly TraceMoment[], time: number | null, direction: -1 | 1): TraceMoment | null {
  if (time === null) return direction === 1 ? moments[0] ?? null : null;
  if (direction === 1) return moments.find((moment) => moment.time > time + 1e-7) ?? null;
  for (let i = moments.length - 1; i >= 0; i--) if (moments[i].time < time - 1e-7) return moments[i];
  return null;
}

export interface TimedItem { start: number; end: number }
export function intervalIndex<T extends TimedItem>(items: readonly T[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const maxEnds = new Float64Array(sorted.length);
  let max = -Infinity;
  sorted.forEach((item, i) => { max = Math.max(max, item.end); maxEnds[i] = max; });
  return { sorted, maxEnds };
}

export function activeIntervals<T extends TimedItem>(index: ReturnType<typeof intervalIndex<T>>, time: number): T[] {
  let lo = 0, hi = index.sorted.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (index.sorted[mid].start <= time) lo = mid + 1; else hi = mid; }
  const result: T[] = [];
  for (let i = lo - 1; i >= 0 && index.maxEnds[i] > time; i--) if (index.sorted[i].end > time) result.push(index.sorted[i]);
  return result.reverse();
}

export function taskIntervals(lane: ColumnarLane) {
  return intervalIndex(Array.from(lane.starts).flatMap((start, idx) => lane.parentIndexes[idx] === -1 && lane.durs[idx] > 0 ? [{ start, end: start + lane.durs[idx], idx }] : []));
}

export function playbackIndex(model: ParsedTraceModel) {
  return {
    tasks: model.lanes.filter((lane) => lane.meta.kind !== "network").map((lane) => ({ lane: lane.meta.id, index: taskIntervals(lane) })),
    requests: intervalIndex(model.requests.map((request, index) => ({ ...request, index }))),
    links: intervalIndex(Array.from(model.connections.edgeIds).flatMap((edge, instance) => model.connections.edges[edge].kind !== "request" && model.connections.ends[instance] > model.connections.starts[instance]
      ? [{ edge, instance, start: model.connections.starts[instance], end: model.connections.ends[instance] }] : [])),
  };
}

export const MAX_PACKETS = 512;

export type PlaybackPacket = TimedItem & (
  | { kind: "link"; edge: number; instance: number }
  | { kind: "request"; request: number; requesterLane: number }
);

export function playbackPackets(index: ReturnType<typeof playbackIndex>, time: number, visibleEdges: ReadonlySet<number>, visibleRequesters: ReadonlySet<number>, isDrawable?: (packet: PlaybackPacket) => boolean) {
  const active: PlaybackPacket[] = activeIntervals(index.links, time).filter((link) => visibleEdges.has(link.edge)).map((link) => ({ ...link, kind: "link" }));
  for (const request of activeIntervals(index.requests, time)) {
    if (request.requesterLane !== null && visibleRequesters.has(request.requesterLane)) active.push({ kind: "request", request: request.index, requesterLane: request.requesterLane, start: request.start, end: request.end });
  }
  // Participant routes can hide siblings on the same edge. Only drawable packets use capacity.
  const drawable = isDrawable ? active.filter(isDrawable) : active;
  drawable.sort((a, b) => a.start - b.start || a.end - b.end || (a.kind === "request" ? a.request : a.instance) - (b.kind === "request" ? b.request : b.instance));
  return { packets: drawable.slice(0, MAX_PACKETS), omitted: Math.max(0, drawable.length - MAX_PACKETS) };
}

export function playbackStatus(model: ParsedTraceModel, index: ReturnType<typeof playbackIndex>, time: number, hidden: ReadonlySet<number>) {
  const active = index.tasks.flatMap(({ lane, index }) => hidden.has(lane) ? [] : activeIntervals(index, time).slice(0, 1).map((task) => ({ lane, ...task })));
  const requests = activeIntervals(index.requests, time);
  const markers = model.markers.filter((marker) => (!model.mainFrameId || marker.frameId === model.mainFrameId) && marker.ts <= time);
  const phase = markers.some((m) => m.label === "Load") ? "After load" : markers.some((m) => m.label === "LCP") ? "After LCP" : markers.some((m) => m.label === "FCP") ? "After FCP" : "Before FCP";
  return { time, active, requests, phase };
}

export function narrate(model: ParsedTraceModel, status: ReturnType<typeof playbackStatus>): string {
  const main = status.active.find((task) => model.lanes[task.lane].meta.kind === "main");
  const activity = main ? `${model.lanes[main.lane].meta.name} runs ${model.names[model.lanes[main.lane].nameIds[main.idx]]} (${(main.end - main.start).toFixed(1)} ms). ` : "";
  return `${activity}${status.requests.length} requests are in flight. ${status.active.length} threads are busy.`;
}
