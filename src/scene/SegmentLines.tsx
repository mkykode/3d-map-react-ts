import { Line } from "@react-three/drei";
import type { Vector3Tuple } from "./cameraActions";

/** Disjoint segments share one LineSegments2 draw, with pixel-sized strokes. */
export function SegmentLines({ points, color, width = 1, opacity = 1, depthTest = true }: {
  points: readonly Vector3Tuple[]; color: string; width?: number; opacity?: number; depthTest?: boolean;
}) {
  if (!points.length) return null;
  return <Line points={points as [number, number, number][]} segments color={color} lineWidth={width} transparent={opacity < 1} opacity={opacity} depthTest={depthTest} depthWrite={depthTest && opacity === 1} fog={false} toneMapped={false} raycast={() => {}} />;
}
