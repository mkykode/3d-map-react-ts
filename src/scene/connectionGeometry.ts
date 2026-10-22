import type { Vector3Tuple } from "./cameraActions";
import type { ConnectionGraph } from "../engine/types";

export interface ConnectionArc {
  id: number;
  from: Vector3Tuple;
  to: Vector3Tuple;
  count: number;
  provenance: ConnectionGraph["edges"][number]["provenance"];
  dim?: boolean;
  aggregate?: boolean;
}

/** One deterministic path shared by strokes, packets, and pointer evidence. */
export function arcPoint(arc: ConnectionArc, t: number): [number, number, number] {
  const [a, b] = [arc.from, arc.to];
  const distance = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const lift = 5 + distance * 0.16 + arc.id % 3;
  return [
    a[0] + (b[0] - a[0]) * t + (distance < 0.1 ? Math.sin(t * Math.PI * 2) * 5 : 0),
    a[1] + (b[1] - a[1]) * t + 4 * t * (1 - t) * lift,
    a[2] + (b[2] - a[2]) * t + (distance < 0.1 ? Math.sin(t * Math.PI) * 5 : 0),
  ];
}
