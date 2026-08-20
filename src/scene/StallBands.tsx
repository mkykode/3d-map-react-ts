import { useMemo } from "react";
import { Billboard, Text } from "@react-three/drei";
import type { ParsedTraceModel } from "../engine/types";
import { computeStalls } from "../engine/aggregate";
import { DIVERGING } from "../engine/categories";
import { INK_MUTED, LANE_GAP, TIME_W } from "./layout";

/**
 * Translucent bands where the main thread sits nearly idle while a
 * render-blocking request is still in flight: the page is stalled on the
 * network, not the CPU.
 */
export function StallBands({
  model,
  t0,
  t1,
  depth,
  height,
}: {
  model: ParsedTraceModel;
  t0: number;
  t1: number;
  depth: number;
  height: number;
}) {
  const bands = useMemo(() => {
    const main = model.lanes.find((lane) => lane.meta.kind === "main");
    return computeStalls(main, model.requests, t0, t1);
  }, [model, t0, t1]);

  if (bands.length === 0) return null;
  const range = t1 - t0;

  return (
    <group>
      {bands.map((band) => {
        const x0 = ((band.start - t0) / range) * TIME_W;
        const w = Math.max(((band.end - band.start) / range) * TIME_W, 0.2);
        return (
          <group key={band.start}>
            <mesh
              position={[x0 + w / 2, height / 2, depth / 2 - LANE_GAP / 2]}
            >
              <boxGeometry args={[w, height, depth + 6]} />
              <meshBasicMaterial
                color={DIVERGING.neutral}
                transparent
                opacity={0.1}
                depthWrite={false}
              />
            </mesh>
            {w > 10 && (
              <Billboard position={[x0 + w / 2, height + 1.6, -2]}>
                <Text fontSize={1} color={INK_MUTED} anchorX="center">
                  waiting on network
                </Text>
              </Billboard>
            )}
          </group>
        );
      })}
    </group>
  );
}
