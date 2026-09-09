import { useMemo } from "react";
import { Edges } from "@react-three/drei";
import type { Vector3Tuple, WorldBounds } from "./cameraActions";
import { ScreenLabel } from "./ScreenLabels";

/** One proxy, not an outline pass over every instance in the scene. */
export function BoxFeedback({ bounds, label, id = "selected-mark" }: { bounds: WorldBounds; label: string; id?: string }) {
  const position = useMemo(() => bounds.min.map((n, i) => (n + bounds.max[i]) / 2) as unknown as Vector3Tuple, [bounds]);
  const size = useMemo(() => bounds.min.map((n, i) => Math.max(0.01, bounds.max[i] - n)) as [number, number, number], [bounds]);
  return <group position={position}>
    <mesh raycast={() => {}}>
      <boxGeometry args={size} /><meshBasicMaterial visible={false} />
      <Edges threshold={15} color="#f5f5f7" lineWidth={2} depthTest={false} />
    </mesh>
    <ScreenLabel id={id} position={[0, size[1] / 2 + 1, 0]} priority={100} kind="selected">◆ {label}</ScreenLabel>
  </group>;
}
