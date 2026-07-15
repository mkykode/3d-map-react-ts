import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Billboard, Line } from "@react-three/drei";
import type { ScreenshotMeta } from "../engine/types";
import { GRID_LINE, TIME_W } from "./layout";

const SHOT_W = 7;
const SHOT_H = 4.6;

/**
 * The screenshot filmstrip: what the page looked like, billboarded along the
 * time axis with a stem down to the exact timestamp.
 */
export function ScreenshotStrip({
  screenshots,
  t0,
  t1,
  y,
  z,
}: {
  screenshots: ScreenshotMeta[];
  t0: number;
  t1: number;
  y: number;
  z: number;
}) {
  const shots = useMemo(
    () => screenshots.filter((s) => s.ts >= t0 && s.ts <= t1),
    [screenshots, t0, t1],
  );
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader();
    return shots.map((s) => {
      const texture = loader.load(s.dataUri);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    });
  }, [shots]);

  // Dispose the previous set on change/unmount; textures hold GPU memory.
  useEffect(() => {
    return () => textures.forEach((t) => t.dispose());
  }, [textures]);

  return (
    <group>
      {shots.map((shot, i) => {
        const x = ((shot.ts - t0) / (t1 - t0)) * TIME_W;
        return (
          <group key={shot.ts}>
            <Line
              points={[
                [x, 0, z],
                [x, y - SHOT_H / 2, z],
              ]}
              color={GRID_LINE}
              lineWidth={1}
            />
            <Billboard position={[x, y, z]}>
              <mesh>
                <planeGeometry args={[SHOT_W, SHOT_H]} />
                <meshBasicMaterial map={textures[i]} toneMapped={false} />
              </mesh>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}
