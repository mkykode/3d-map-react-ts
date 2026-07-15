import { Billboard, Line, Text } from "@react-three/drei";
import type { VitalMarker } from "../engine/types";
import { INK, INK_SECONDARY, xOf } from "./layout";

/**
 * Web-vitals markers as vertical beacons spanning every lane. Identity comes
 * from the label, not color (labels are ink; color stays with categories).
 */
export function VitalsBeacons({
  markers,
  rangeMs,
  depth,
  height,
}: {
  markers: VitalMarker[];
  rangeMs: number;
  depth: number;
  height: number;
}) {
  // Stagger labels that land within a few world units of each other.
  const sorted = [...markers].sort((a, b) => a.ts - b.ts);
  const levels = new Map<string, number>();
  let prevX = -Infinity;
  let level = 0;
  for (const marker of sorted) {
    const x = xOf(marker.ts, rangeMs);
    level = x - prevX < 7 ? (level + 1) % 3 : 0;
    levels.set(`${marker.name}-${marker.ts}`, level);
    prevX = x;
  }

  return (
    <group>
      {markers.map((marker) => {
        const x = xOf(marker.ts, rangeMs);
        const labelY =
          height + 1.1 + (levels.get(`${marker.name}-${marker.ts}`) ?? 0) * 1.7;
        return (
          <group key={`${marker.name}-${marker.ts}`}>
            <Line
              points={[
                [x, 0, -2],
                [x, height, -2],
              ]}
              color={INK_SECONDARY}
              lineWidth={1.5}
              transparent
              opacity={0.9}
            />
            <mesh position={[x, height / 2, depth / 2 - 1]}>
              <planeGeometry args={[0.06, height]} />
              <meshBasicMaterial
                color={INK_SECONDARY}
                transparent
                opacity={0.14}
                side={2}
                depthWrite={false}
              />
            </mesh>
            <Billboard position={[x, labelY, -2]}>
              <Text fontSize={1.25} color={INK} anchorX="center">
                {marker.label}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}
