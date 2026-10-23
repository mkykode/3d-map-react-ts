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
  /** Resource routes can share an edge but have distinct request endpoints. */
  request?: number;
  lift?: number;
  loopRadius?: number;
}

/** One deterministic path shared by strokes, packets, and pointer evidence. */
export function arcPoint(arc: ConnectionArc, t: number): [number, number, number] {
  const [a, b] = [arc.from, arc.to];
  const distance = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const lift = arc.lift ?? 5 + distance * 0.16 + arc.id % 3;
  const radius = arc.loopRadius ?? 5;
  return [
    a[0] + (b[0] - a[0]) * t + (distance < 0.1 ? Math.sin(t * Math.PI * 2) * radius : 0),
    a[1] + (b[1] - a[1]) * t + 4 * t * (1 - t) * lift,
    a[2] + (b[2] - a[2]) * t + (distance < 0.1 ? Math.sin(t * Math.PI) * radius : 0),
  ];
}
