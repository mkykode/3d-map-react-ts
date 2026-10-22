import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { arcPoint, type ConnectionArc } from "./connectionGeometry";
import { INK_MUTED, INK_SECONDARY } from "./layout";
import { SCENE_DEBUG } from "./diagnostics";

const SEGMENTS = 32;
const UP = new Vector3(0, 1, 0);

/** Solid and dashed paths share one bounded instance buffer and one draw. */
export function ConnectionArcs({ arcs, onHover, onSelect }: {
  arcs: readonly ConnectionArc[];
  onHover?: (arc: ConnectionArc | null, event: ThreeEvent<PointerEvent>) => void;
  onSelect?: (arc: ConnectionArc) => void;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const segments = useMemo(() => arcs.flatMap((arc) => Array.from({ length: SEGMENTS }, (_, i) => i)
    .filter((i) => arc.provenance === "recorded" || i % 4 < 2)
    .map((i) => ({ arc, a: arcPoint(arc, i / SEGMENTS), b: arcPoint(arc, (i + 1) / SEGMENTS) }))), [arcs]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new Matrix4(), rotation = new Quaternion();
    const a = new Vector3(), b = new Vector3(), direction = new Vector3(), center = new Vector3();
    segments.forEach((segment, i) => {
      a.set(...segment.a); b.set(...segment.b);
      direction.subVectors(b, a);
      const length = direction.length();
      rotation.setFromUnitVectors(UP, direction.normalize());
      const width = segment.arc.count > 20 ? 0.13 : segment.arc.count > 5 ? 0.09 : 0.06;
      matrix.compose(center.addVectors(a, b).multiplyScalar(0.5), rotation, new Vector3(width, length, width));
      mesh.current!.setMatrixAt(i, matrix);
      mesh.current!.setColorAt(i, new Color(segment.arc.dim ? "#353b44" : segment.arc.provenance === "recorded" ? INK_SECONDARY : INK_MUTED));
    });
    mesh.current.count = segments.length;
    if (SCENE_DEBUG) { mesh.current.userData.arcIds = segments.map((segment) => segment.arc.id); mesh.current.userData.arcs = arcs; }
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [segments, arcs]);
  return <instancedMesh ref={mesh} name="connection-arcs" args={[undefined, undefined, Math.max(1, segments.length)]} count={segments.length}
    onPointerMove={(event) => { const arc = segments[event.instanceId ?? -1]?.arc; if (arc && onHover) { event.stopPropagation(); onHover(arc, event); } }}
    onPointerOut={(event) => onHover?.(null, event)}
    onClick={(event) => { const arc = segments[event.instanceId ?? -1]?.arc; if (arc && onSelect && event.delta <= 4) { event.stopPropagation(); onSelect(arc); } }}>
    <cylinderGeometry args={[1, 1, 1, 4]} />
    <meshBasicMaterial fog={false} toneMapped={false} />
  </instancedMesh>;
}
