import { create } from "zustand";
import { engineClient } from "../engine/engineClient";
import type { ParsedTraceModel } from "../engine/types";

export type ViewId = "canyon" | "terrain" | "rhythm" | "city" | "diff";
export type CameraPreset = "orbit" | "top" | "side";
export type ScaleMode = "linear" | "log";

export type Selection =
  | { kind: "entry"; lane: number; idx: number }
  | { kind: "name"; nameId: number };

export interface HoverInfo {
  lane: number;
  idx: number;
  clientX: number;
  clientY: number;
}

interface AppState {
  model: ParsedTraceModel | null;
  modelB: ParsedTraceModel | null;
  status: string | null;
  error: string | null;
  view: ViewId;
  preset: CameraPreset;
  scale: ScaleMode;
  /** Time window [t0, t1] in ms, or null for the full trace. */
  brush: [number, number] | null;
  selection: Selection | null;

  loadPrimaryFile: (file: File) => Promise<void>;
  loadSecondaryFile: (file: File) => Promise<void>;
  loadDemo: () => Promise<void>;
  setView: (view: ViewId) => void;
  setPreset: (preset: CameraPreset) => void;
  setScale: (scale: ScaleMode) => void;
  setBrush: (brush: [number, number] | null) => void;
  setSelection: (selection: Selection | null) => void;
}

// Only the latest primary/secondary load may write its result; a slow demo
// parse must never clobber a trace the user picked afterwards.
let primaryGeneration = 0;
let secondaryGeneration = 0;

export const useAppStore = create<AppState>((set) => ({
  model: null,
  modelB: null,
  status: null,
  error: null,
  view: "canyon",
  preset: "orbit",
  scale: "linear",
  brush: null,
  selection: null,

  loadPrimaryFile: async (file) => {
    const generation = ++primaryGeneration;
    set({ status: `Parsing ${file.name}…`, error: null });
    try {
      const model = await engineClient.parseFile(file);
      if (generation !== primaryGeneration) return;
      set({ model, status: null, brush: null, selection: null });
    } catch (error) {
      if (generation !== primaryGeneration) return;
      set({ status: null, error: describeError(error) });
    }
  },

  loadSecondaryFile: async (file) => {
    const generation = ++secondaryGeneration;
    set({ status: `Parsing comparison ${file.name}…`, error: null });
    try {
      const modelB = await engineClient.parseFile(file);
      if (generation !== secondaryGeneration) return;
      set({ modelB, status: null, view: "diff" });
    } catch (error) {
      if (generation !== secondaryGeneration) return;
      set({ status: null, error: describeError(error) });
    }
  },

  loadDemo: async () => {
    const generation = ++primaryGeneration;
    set({ status: "Loading demo trace…", error: null });
    try {
      const model = await engineClient.parseUrl(
        `${import.meta.env.BASE_URL}demo-trace.json`,
      );
      if (generation !== primaryGeneration) return;
      set({ model, status: null });
    } catch (error) {
      if (generation !== primaryGeneration) return;
      set({ status: null, error: describeError(error) });
    }
  },

  setView: (view) => set({ view }),
  setPreset: (preset) => set({ preset }),
  setScale: (scale) => set({ scale }),
  setBrush: (brush) => set({ brush }),
  setSelection: (selection) => set({ selection }),
}));

/** Hover changes at pointer frequency; isolated so only the tooltip renders. */
export const useHoverStore = create<{
  hover: HoverInfo | null;
  setHover: (hover: HoverInfo | null) => void;
}>((set) => ({
  hover: null,
  setHover: (hover) => set({ hover }),
}));

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The active analysis window: brush if set, else the full trace. */
export function windowOf(
  model: ParsedTraceModel,
  brush: [number, number] | null,
): [number, number] {
  return brush ?? [0, model.rangeMs];
}
