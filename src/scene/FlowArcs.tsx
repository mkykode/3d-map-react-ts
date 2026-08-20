import { useMemo } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import type { ParsedTraceModel } from "../engine/types";
import { useAppStore } from "../state/store";
import { BOX_H, INK_SECONDARY, TIME_W, laneZ } from "./layout";

/**
 * Causality arcs from the trace's flow events: when an entry is selected,
 * every flow chain passing through it lights up as arcs across the canyon.
 * Segments touching hidden lanes or points outside the window are skipped.
 */
export function FlowArcs({
  model,
  t0,
  t1,
  zIndexOf,
}: {
  model: ParsedTraceModel;
  t0: number;
  t1: number;
  zIndexOf: Map<number, number>;
}) {
  const selection = useAppStore((s) => s.selection);
  const range = t1 - t0;

  const arcs = useMemo(() => {
    if (selection?.kind !== "entry") return [];
    const result: THREE.Vector3[][] = [];
    const toWorld = (lane: number, idx: number): THREE.Vector3 | null => {
      const vi = zIndexOf.get(lane);
      if (vi === undefined) return null;
      const start = model.lanes[lane].starts[idx];
      if (start < t0 || start > t1) return null;
      return new THREE.Vector3(
        ((start - t0) / range) * TIME_W,
        (model.lanes[lane].depths[idx] + 1) * BOX_H,
        laneZ(vi),
      );
    };
    for (const flow of model.flows) {
      const touches = flow.points.some(
        (p) => p.lane === selection.lane && p.idx === selection.idx,
      );
      if (!touches) continue;
      for (let i = 0; i < flow.points.length - 1; i++) {
        const from = toWorld(flow.points[i].lane, flow.points[i].idx);
        const to = toWorld(flow.points[i + 1].lane, flow.points[i + 1].idx);
        if (!from || !to) continue;
        const mid = from
          .clone()
          .add(to)
          .multiplyScalar(0.5)
          .setY(Math.max(from.y, to.y) + 4 + from.distanceTo(to) * 0.12);
        const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
        result.push(curve.getPoints(24));
      }
    }
    return result;
  }, [selection, model, t0, t1, range, zIndexOf]);

  if (arcs.length === 0) return null;
  return (
    <group>
      {arcs.map((points, i) => (
        <Line
          key={i}
          points={points}
          color={INK_SECONDARY}
          lineWidth={1.5}
          transparent
          opacity={0.85}
        />
      ))}
    </group>
  );
}
