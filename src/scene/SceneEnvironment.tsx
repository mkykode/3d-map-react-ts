import { Grid } from "@react-three/drei";
import { DoubleSide } from "three";
import type { WorldBounds } from "./cameraActions";
import { GRID_LINE, GROUND, SURFACE } from "./layout";

/** The environment supplies distance cues; data materials keep their palette. */
export function SceneEnvironment({ bounds }: { bounds: WorldBounds }) {
  const floor = Math.min(-0.2, bounds.min[1] - 0.3);
  return <>
    <color attach="background" args={[SURFACE]} />
    <fog attach="fog" args={[SURFACE, 200, 850]} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[80, floor - 0.1, 0]} raycast={() => {}}>
      <planeGeometry args={[4000, 4000]} />
      <meshBasicMaterial color={GROUND} side={DoubleSide} />
    </mesh>
    <Grid position={[0, floor, 0]} infiniteGrid followCamera cellSize={5} sectionSize={20} cellThickness={0.4} sectionThickness={0.8} cellColor={GRID_LINE} sectionColor="#3a414d" fadeDistance={400} fadeStrength={2} side={DoubleSide} />
  </>;
}
