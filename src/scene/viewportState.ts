import { create } from "zustand";
import type { Vector3Tuple, WorldBounds } from "./cameraActions";

export const useSceneViewport = create<{ footprint: Vector3Tuple[]; bounds: WorldBounds | null; side: boolean; position: Vector3Tuple | null; target: Vector3Tuple | null }>(() => ({ footprint: [], bounds: null, side: false, position: null, target: null }));
