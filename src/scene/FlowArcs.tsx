import { useMemo } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import type { ParsedTraceModel } from "../engine/types";
import { useAppStore } from "../state/store";
import { BOX_H, INK_SECONDARY, laneZ, xOf } from "./layout";

/**
 * Causality arcs from the trace's flow events: when an entry is selected,
 * every flow chain passing through it lights up as arcs across the canyon.
 */
export function FlowArcs({ model }: { model: ParsedTraceModel }) {
  const selection = useAppStore((s) => s.selection);

  const arcs = useMemo(() => {
    if (selection?.kind !== "entry") return [];
    const result: THREE.Vector3[][] = [];
    for (const flow of model.flows) {
      const touches = flow.points.some(
        (p) => p.lane === selection.lane && p.idx === selection.idx,
      );
      if (!touches) continue;
      for (let i = 0; i < flow.points.length - 1; i++) {
        const a = flow.points[i];
        const b = flow.points[i + 1];
        const laneA = model.lanes[a.lane];
        const laneB = model.lanes[b.lane];
        const from = new THREE.Vector3(
          xOf(laneA.starts[a.idx], model.rangeMs),
          (laneA.depths[a.idx] + 1) * BOX_H,
          laneZ(a.lane),
        );
        const to = new THREE.Vector3(
          xOf(laneB.starts[b.idx], model.rangeMs),
          (laneB.depths[b.idx] + 1) * BOX_H,
          laneZ(b.lane),
        );
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
  }, [selection, model]);

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
