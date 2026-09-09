import { useMemo } from "react";
import { useAppStore, useHoverStore } from "../state/store";
import type { ParsedTraceModel } from "../engine/types";
import { eventBounds, type LanePlacement } from "./traceLayout";
import type { Vector3Tuple, WorldBounds } from "./cameraActions";
import { SegmentLines } from "./SegmentLines";
import { ScreenLabel } from "./ScreenLabels";
import { formatMs } from "./layout";
import { BoxFeedback } from "./BoxFeedback";

export function EventFeedback({ model, placements, t0, t1 }: {
  model: ParsedTraceModel; placements: LanePlacement[]; t0: number; t1: number;
}) {
  const selection = useAppStore((s) => s.selection);
  const hoverKey = useHoverStore((s) => s.hover && !s.hover.summary ? `${s.hover.lane}:${s.hover.idx}` : "");
  const hovered = useMemo(() => hoverKey ? hoverKey.split(":").map(Number) : null, [hoverKey]);
  const selected = selection?.kind === "entry" ? [selection.lane, selection.idx] : null;
  return <group>
    <AggregateFeedback />
    {selected && <Feedback key="selected" target={selected} model={model} placements={placements} t0={t0} t1={t1} selected />}
    {hovered && (!selected || hovered[0] !== selected[0] || hovered[1] !== selected[1]) && <Feedback key="hovered" target={hovered} model={model} placements={placements} t0={t0} t1={t1} />}
  </group>;
}

function AggregateFeedback() {
  const bounds = useHoverStore((s) => s.hover?.bounds);
  const label = useHoverStore((s) => s.hover?.summary?.title);
  return bounds && label ? <BoxFeedback id="hovered-aggregate" bounds={bounds} label={`${label} · click to expand`} /> : null;
}

function boxSegments(bounds: WorldBounds): Vector3Tuple[] {
  const { min, max } = bounds;
  const corners = [min, [max[0], min[1], min[2]], [max[0], max[1], min[2]], [min[0], max[1], min[2]],
    [min[0], min[1], max[2]], [max[0], min[1], max[2]], max, [min[0], max[1], max[2]]] as Vector3Tuple[];
  return [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].flatMap(([a, b]) => [corners[a], corners[b]]);
}

function Feedback({ target, model, placements, t0, t1, selected = false }: {
  target: number[]; model: ParsedTraceModel; placements: LanePlacement[]; t0: number; t1: number; selected?: boolean;
}) {
  const placement = placements.find((p) => p.lane.meta.id === target[0]);
  if (!placement) return null;
  const idx = target[1];
  const bounds = eventBounds(placement, idx, t0, t1);
  if (!bounds) return null;
  const center: [number, number, number] = [(bounds.min[0] + bounds.max[0]) / 2, bounds.max[1] + 1.5, (bounds.min[2] + bounds.max[2]) / 2];
  const lineage: Vector3Tuple[] = [];
  let parent = placement.lane.parentIndexes[idx];
  let previous: Vector3Tuple = [center[0], bounds.max[1], center[2]];
  const visited = new Set<number>([idx]);
  while (parent >= 0 && !visited.has(parent)) {
    visited.add(parent);
    const b = eventBounds(placement, parent, t0, t1);
    if (!b) break;
    const point: Vector3Tuple = [center[0], b.max[1], (b.min[2] + b.max[2]) / 2];
    lineage.push(previous, point);
    previous = point;
    parent = placement.lane.parentIndexes[parent];
  }
  return <group>
    <SegmentLines points={boxSegments(bounds)} color={selected ? "#f5f5f7" : "#86b6ef"} width={selected ? 2.5 : 2} depthTest={false} />
    <SegmentLines points={lineage} color="#c3c2b7" width={1.5} opacity={0.8} />
    <ScreenLabel id={selected ? "selected-event" : "hovered-event"} position={center} priority={selected ? 100 : 90} kind={selected ? "selected" : "hover"}>
      {selected ? "◆ " : "◇ "}{model.names[placement.lane.nameIds[idx]]} · {formatMs(placement.lane.selfTimes[idx])} self
    </ScreenLabel>
  </group>;
}
