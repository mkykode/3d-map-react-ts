import { useMemo } from "react";
import { Line, Text } from "@react-three/drei";
import {
  formatMs,
  GRID_LINE,
  GROUND,
  INK_MUTED,
  niceTickStep,
  TIME_W,
  xOf,
} from "./layout";

/** Ground plane, tick lines across all lanes, and time labels at the front. */
export function TimeRuler({
  rangeMs,
  depth,
}: {
  rangeMs: number;
  depth: number;
}) {
  const ticks = useMemo(() => {
    const step = niceTickStep(rangeMs);
    const result: number[] = [];
    for (let t = 0; t <= rangeMs; t += step) result.push(t);
    return result;
  }, [rangeMs]);

  const zNear = -4;
  const zFar = depth + 1;

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[TIME_W / 2, -0.05, (zNear + zFar) / 2]}
      >
        <planeGeometry args={[TIME_W + 30, zFar - zNear + 14]} />
        <meshBasicMaterial color={GROUND} />
      </mesh>
      {ticks.map((t) => {
        const x = xOf(t, rangeMs);
        return (
          <group key={t}>
            <Line
              points={[
                [x, 0.01, zNear],
                [x, 0.01, zFar],
              ]}
              color={GRID_LINE}
              lineWidth={1}
            />
            <Text
              position={[x, 0.02, zNear - 1.6]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={1.05}
              color={INK_MUTED}
              anchorX="center"
            >
              {formatMs(t)}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
