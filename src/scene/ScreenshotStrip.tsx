import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Billboard } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { ScreenshotMeta } from "../engine/types";
import { GRID_LINE, TIME_W } from "./layout";
import { SegmentLines } from "./SegmentLines";
import type { Vector3Tuple } from "./cameraActions";

const SHOT_W = 8;
const SHOT_H = 5;
const MAX_SHOTS = 12;

export function ScreenshotStrip({ screenshots, t0, t1, y, z }: { screenshots: ScreenshotMeta[]; t0: number; t1: number; y: number; z: number }) {
  const shots = useMemo(() => {
    const candidates = screenshots.filter((s) => s.ts >= t0 && s.ts <= t1);
    const spaced: ScreenshotMeta[] = [];
    const minimumGap = (t1 - t0) * SHOT_W / TIME_W;
    for (const shot of candidates) {
      if (spaced.length === 0 || shot.ts - spaced[spaced.length - 1].ts >= minimumGap) spaced.push(shot);
    }
    if (spaced.length <= MAX_SHOTS) return spaced;
    return Array.from({ length: MAX_SHOTS }, (_, i) => spaced[Math.round(i * (spaced.length - 1) / (MAX_SHOTS - 1))]);
  }, [screenshots, t0, t1]);
  const stems = useMemo<Vector3Tuple[]>(() => shots.flatMap((s) => {
    const x = (s.ts - t0) / (t1 - t0) * TIME_W;
    return [[x, 0, z], [x, y - SHOT_H / 2, z]] as Vector3Tuple[];
  }), [shots, t0, t1, y, z]);
  return <group>
    <SegmentLines points={stems} color={GRID_LINE} />
    {shots.map((shot) => <Billboard key={shot.ts} position={[(shot.ts - t0) / (t1 - t0) * TIME_W, y, z]}><Screenshot shot={shot} /></Billboard>)}
  </group>;
}

function Screenshot({ shot }: { shot: ScreenshotMeta }) {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const targetMaterial = material.current;
    let cancelled = false;
    const texture = new THREE.TextureLoader().load(shot.dataUri, (loaded) => {
      if (cancelled) { loaded.dispose(); return; }
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      const image = loaded.image as HTMLImageElement;
      const aspect = image.width / Math.max(1, image.height);
      mesh.current?.scale.set(Math.min(SHOT_W, SHOT_H * aspect), Math.min(SHOT_H, SHOT_W / aspect), 1);
      if (material.current) { material.current.map = loaded; material.current.needsUpdate = true; }
      gl.initTexture(loaded);
      invalidate();
    }, undefined, (error) => {
      if (!cancelled) { console.warn("Trace screenshot could not be decoded", error); invalidate(); }
    });
    return () => {
      cancelled = true;
      if (targetMaterial) targetMaterial.map = null;
      texture.dispose();
    };
  }, [shot.dataUri, gl, invalidate]);
  return <mesh ref={mesh} scale={[SHOT_W, SHOT_H, 1]} raycast={() => {}}>
    <planeGeometry /><meshBasicMaterial ref={material} toneMapped={false} fog={false} />
  </mesh>;
}
