import { useMemo } from "react";
import * as THREE from "three";
import type { ParsedTraceModel } from "../engine/types";
import { useAppStore } from "../state/store";
import { INK_SECONDARY } from "./layout";
import { eventBounds, type LanePlacement } from "./traceLayout";
import type { Vector3Tuple } from "./cameraActions";
import { SegmentLines } from "./SegmentLines";

export function FlowArcs({ model, t0, t1, placements }: { model: ParsedTraceModel; t0: number; t1: number; placements: LanePlacement[] }) {
  const selection = useAppStore((s) => s.selection);
  const arcs = useMemo<Vector3Tuple[]>(() => {
    if (selection?.kind !== "entry") return [];
    const result: Vector3Tuple[] = [];
    const toWorld = (lane: number, idx: number) => {
      const placement = placements.find((p) => p.lane.meta.id === lane);
      const b = placement && eventBounds(placement, idx, t0, t1);
      return b ? new THREE.Vector3((b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2) : null;
    };
    for (const flow of model.flows) {
      if (!flow.points.some((p) => p.lane === selection.lane && p.idx === selection.idx)) continue;
      for (let i = 0; i < flow.points.length - 1; i++) {
        const from = toWorld(flow.points[i].lane, flow.points[i].idx);
        const to = toWorld(flow.points[i + 1].lane, flow.points[i + 1].idx);
        if (!from || !to) continue;
        const mid = from.clone().add(to).multiplyScalar(0.5).setY(Math.max(from.y, to.y) + 4 + from.distanceTo(to) * 0.12);
        const points = new THREE.QuadraticBezierCurve3(from, mid, to).getPoints(24);
        for (let j = 1; j < points.length; j++) result.push(points[j - 1].toArray(), points[j].toArray());
      }
    }
    return result;
  }, [selection, model, t0, t1, placements]);
  return <SegmentLines points={arcs} color={INK_SECONDARY} width={1.5} opacity={0.85} />;
}
