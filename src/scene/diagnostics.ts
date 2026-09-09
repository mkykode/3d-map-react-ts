/** Explicit opt-in: production render loops never write test attributes. */
export const SCENE_DEBUG = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
import type { RootState } from "@react-three/fiber";

export type SceneDebugHost = HTMLElement & { traceScene?: () => RootState };
