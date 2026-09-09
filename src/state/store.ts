import { create } from "zustand";
import type { HoverInfo } from "./hover";
import { engineClient } from "../engine/engineClient";
import { STREAM_LIMITS } from "../engine/ingest/budget";
import type { TraceWindow } from "../engine/ingest/types";
import type { TraceImportState } from "./traceImport";
import { DEFAULT_VISIBLE_LANES } from "../engine/constants";
import type { SessionManifest } from "../engine/protocol";
import type { ParsedTraceModel } from "../engine/types";
import type { AnalysisScope, Finding, FindingId } from "../domain/analysis";
import type { EvidenceIdentity } from "../domain/evidence";
import {
  type CameraActionKind,
  type CameraActionPreset,
  type CameraControlMode,
  type CameraInputCommand,
  type SerializableCameraPose,
  type TraceSelection,
} from "../scene/cameraActions";
import type { PanPlane } from "../scene/cameraNavigation";
import type {
  FindingDetail,
  FindingProjection,
  RegressionProjection,
} from "../engine/findingContract";

export type ViewId =
  | "canyon"
  | "terrain"
  | "rhythm"
  | "city"
  | "diff"
  | "vitals";
export type CameraPreset = CameraActionPreset;
export type CameraMode = CameraControlMode;
export type ScaleMode = "linear" | "log";

export type Selection = TraceSelection;

interface AppState {
  model: ParsedTraceModel | null;
  modelB: ParsedTraceModel | null;
  primarySession: SessionManifest | null;
  secondarySession: SessionManifest | null;
  status: string | null;
  error: string | null;
  traceImport: TraceImportState | null;
  lastTraceImport: TraceImportState | null;
  confirmTraceImport: (window: TraceWindow | null) => Promise<void>;
  cancelTraceImport: () => void;
  reopenTraceImport: () => void;
  view: ViewId;
  preset: CameraPreset;
  cameraMode: CameraMode;
  panPlane: PanPlane;
  scale: ScaleMode;
  /** Time window [t0, t1] in ms, or null for the full trace. */
  brush: [number, number] | null;
  selectedNavigationId: string | null;
  selection: Selection | null;
  /** Lane ids hidden by the track picker. */
  hiddenLanes: Set<number>;
  /** When true, the canyon renders the brush window as its full extent. */
  zoomed: boolean;
  hudOpen: boolean;
  trackPickerOpen: boolean;
  analysisScope: AnalysisScope | null;
  analysisFindings: readonly Finding[];
  analysisFindingDetail: FindingDetail | null;
  analysisFindingProjection: FindingProjection | null;
  analysisRegressionProjection: RegressionProjection | null;
  cameraCommand: { id: number; kind: CameraActionKind };
  cameraInput: { id: number; command: CameraInputCommand } | null;
  cameraPose: SerializableCameraPose | null;

  loadPrimaryFile: (file: File) => Promise<void>;
  loadSecondaryFile: (file: File) => Promise<void>;
  loadDemo: () => Promise<void>;
  setView: (view: ViewId) => void;
  setPreset: (preset: CameraPreset) => void;
  setCameraMode: (cameraMode: CameraMode) => void;
  setPanPlane: (panPlane: PanPlane) => void;
  setScale: (scale: ScaleMode) => void;
  setBrush: (brush: [number, number] | null) => void;
  setSelectedNavigationId: (navigationId: string | null) => void;
  setSelection: (selection: Selection | null) => void;
  toggleLane: (laneId: number) => void;
  setHiddenLanes: (hidden: Set<number>) => void;
  setZoomed: (zoomed: boolean) => void;
  toggleHud: () => void;
  toggleTrackPicker: () => void;
  setAnalysisResults: (
    scope: AnalysisScope,
    findings: readonly Finding[],
  ) => void;
  clearAnalysisResults: () => void;
  setAnalysisFindingDetail: (detail: FindingDetail | null) => void;
  setAnalysisFindingProjection: (projection: FindingProjection | null) => void;
  setAnalysisRegressionProjection: (
    projection: RegressionProjection | null,
  ) => void;
  selectAnalysisFinding: (
    findingId: FindingId,
    evidenceId: EvidenceIdentity | null,
  ) => void;
  focusAnalysisFinding: (direction: "next" | "previous") => void;
  requestCameraAction: (kind: CameraActionKind) => void;
  dispatchCameraInput: (command: CameraInputCommand) => void;
  setCameraPose: (cameraPose: SerializableCameraPose) => void;
}

/**
 * Lanes beyond the default window start hidden; the track picker reveals
 * them. Structural lanes (main threads, GPU, network) always stay visible.
 */
export function defaultHiddenLanes(model: ParsedTraceModel): Set<number> {
  return new Set(
    model.lanes
      .slice(DEFAULT_VISIBLE_LANES)
      .filter((lane) => lane.meta.kind === "thread")
      .map((lane) => lane.meta.id),
  );
}

function primaryModelState(
  model: ParsedTraceModel,
  primarySession: SessionManifest,
) {
  useHoverStore.getState().setHover(null);
  return {
    model,
    primarySession,
    status: null,
    brush: null,
    selectedNavigationId: model.defaultNavigationId,
    selection: null,
    zoomed: false,
    hiddenLanes: defaultHiddenLanes(model),
  };
}

// Only the latest primary/secondary load may write its result; a slow demo
// parse must never clobber a trace the user picked afterwards.
let primaryGeneration = 0;
let secondaryGeneration = 0;

export const useAppStore = create<AppState>((set) => ({
  model: null,
  modelB: null,
  primarySession: null,
  secondarySession: null,
  status: null,
  error: null,
  traceImport: null,
  lastTraceImport: null,
  confirmTraceImport: (window) => finishFileImport(window),
  cancelTraceImport: () => {
    activeFileImport?.controller.abort();
    activeFileImport = null;
    set({ traceImport: null, status: null });
  },
  reopenTraceImport: () => {
    const previous = useAppStore.getState().lastTraceImport;
    if (!previous) return;
    activeFileImport?.controller.abort();
    activeFileImport = { controller: new AbortController(), generation: nextFileGeneration(previous.slot), slot: previous.slot };
    set({ traceImport: { ...previous, phase: "choosing", error: null, progress: null }, error: null });
  },
  view: "canyon",
  preset: "orbit",
  cameraMode: "strategy",
  panPlane: "xz",
  scale: "linear",
  brush: null,
  selectedNavigationId: null,
  selection: null,
  hiddenLanes: new Set<number>(),
  zoomed: false,
  hudOpen: false,
  trackPickerOpen: false,
  analysisScope: null,
  analysisFindings: [],
  analysisFindingDetail: null,
  analysisFindingProjection: null,
  analysisRegressionProjection: null,
  cameraCommand: { id: 0, kind: "reset" },
  cameraInput: null,
  cameraPose: null,

  loadPrimaryFile: (file) => startFileImport(file, "primary"),
  loadSecondaryFile: (file) => startFileImport(file, "secondary"),

  loadDemo: async () => {
    const generation = ++primaryGeneration;
    set({ status: "Loading demo trace…", error: null });
    try {
      const previousSession = useAppStore.getState().primarySession;
      const loaded = await engineClient.parseUrl(
        `${import.meta.env.BASE_URL}demo-trace.json`,
        "primary",
      );
      if (generation !== primaryGeneration) {
        await engineClient.disposeSession(loaded.manifest.id);
        return;
      }
      if (previousSession) await engineClient.disposeSession(previousSession.id);
      set(primaryModelState(loaded.projection, loaded.manifest));
    } catch (error) {
      if (generation !== primaryGeneration) return;
      set({ status: null, error: describeError(error) });
    }
  },

  setView: (view) => set({ view }),
  setPreset: (preset) => set({ preset }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setPanPlane: (panPlane) => set({ panPlane }),
  setScale: (scale) => set({ scale }),
  setBrush: (brush) =>
    set((state) => ({ brush, zoomed: brush === null ? false : state.zoomed })),
  setSelectedNavigationId: (navigationId) =>
    set((state) => {
      if (
        navigationId !== null &&
        !state.model?.navigations.some(
          (navigation) => navigation.id === navigationId,
        )
      ) {
        return {};
      }
      return { selectedNavigationId: navigationId };
    }),
  setSelection: (selection) => set({ selection }),
  toggleLane: (laneId) =>
    set((state) => {
      const hidden = new Set(state.hiddenLanes);
      if (hidden.has(laneId)) hidden.delete(laneId);
      else hidden.add(laneId);
      return { hiddenLanes: hidden };
    }),
  setHiddenLanes: (hidden) => set({ hiddenLanes: hidden }),
  setZoomed: (zoomed) => set({ zoomed }),
  toggleHud: () => set((state) => ({ hudOpen: !state.hudOpen })),
  toggleTrackPicker: () =>
    set((state) => ({ trackPickerOpen: !state.trackPickerOpen })),
  setAnalysisResults: (analysisScope, analysisFindings) =>
    set({ analysisScope, analysisFindings, analysisFindingDetail: null }),
  clearAnalysisResults: () =>
    set({
      analysisScope: null,
      analysisFindings: [],
      analysisFindingDetail: null,
      analysisFindingProjection: null,
      analysisRegressionProjection: null,
    }),
  setAnalysisFindingDetail: (analysisFindingDetail) =>
    set({ analysisFindingDetail }),
  setAnalysisFindingProjection: (analysisFindingProjection) =>
    set({ analysisFindingProjection }),
  setAnalysisRegressionProjection: (analysisRegressionProjection) =>
    set({ analysisRegressionProjection }),
  selectAnalysisFinding: (selectedFindingId, selectedEvidenceId) =>
    set((state) => {
      if (
        !state.analysisScope ||
        !state.analysisFindings.some((finding) => finding.id === selectedFindingId)
      ) {
        return {};
      }
      return {
        analysisFindingDetail: state.analysisScope.selectedFindingId === selectedFindingId
          ? state.analysisFindingDetail
          : null,
        analysisScope: {
          ...state.analysisScope,
          selectedFindingId,
          selectedEvidenceId,
        },
      };
    }),
  focusAnalysisFinding: (direction) =>
    set((state) => {
      if (!state.analysisScope || !state.analysisRegressionProjection) return {};
      const marks = state.analysisRegressionProjection.marks;
      if (marks.length < 2) return {};
      const current = marks.findIndex(
        (mark) => mark.findingId === state.analysisScope?.selectedFindingId,
      );
      const offset = direction === "next" ? 1 : -1;
      const index = current < 0
        ? direction === "next" ? 0 : marks.length - 1
        : (current + offset + marks.length) % marks.length;
      const mark = marks[index];
      return {
        view: "diff",
        analysisFindingDetail: null,
        analysisScope: {
          ...state.analysisScope,
          selectedFindingId: mark.findingId,
          selectedEvidenceId: mark.evidenceId,
        },
        cameraCommand: {
          id: state.cameraCommand.id + 1,
          kind: "fit-selection",
        },
      };
    }),
  requestCameraAction: (kind) =>
    set((state) => ({ cameraCommand: { id: state.cameraCommand.id + 1, kind } })),
  dispatchCameraInput: (command) =>
    set((state) => ({
      cameraInput: { id: (state.cameraInput?.id ?? 0) + 1, command },
    })),
  setCameraPose: (cameraPose) => set({ cameraPose }),
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

interface FileImportJob {
  controller: AbortController;
  generation: number;
  slot: "primary" | "secondary";
}
let activeFileImport: FileImportJob | null = null;

function nextFileGeneration(slot: FileImportJob["slot"]): number {
  return slot === "primary" ? ++primaryGeneration : ++secondaryGeneration;
}

function currentFileImport(job: FileImportJob): boolean {
  return activeFileImport === job && !job.controller.signal.aborted &&
    job.generation === (job.slot === "primary" ? primaryGeneration : secondaryGeneration);
}

async function startFileImport(file: File, slot: FileImportJob["slot"]): Promise<void> {
  activeFileImport?.controller.abort();
  const job = { controller: new AbortController(), generation: nextFileGeneration(slot), slot };
  activeFileImport = job;
  useAppStore.setState({ status: `Reading ${file.name}…`, error: null, traceImport: { file, slot, phase: "loading", overview: null, progress: null, error: null } });
  try {
    const magic = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (!currentFileImport(job)) return;
    if (file.size > STREAM_LIMITS.largeFileBytes || (magic[0] === 0x1f && magic[1] === 0x8b)) {
      updateImport(job, { phase: "scanning" });
      const overview = await engineClient.scanFile(file, slot, {
        signal: job.controller.signal,
        onProgress: (progress) => updateImport(job, { progress }),
      });
      updateImport(job, { overview, phase: "choosing", progress: null });
      if (currentFileImport(job)) useAppStore.setState({ status: null });
    } else {
      await finishFileImport(null);
    }
  } catch (error) {
    if (!currentFileImport(job)) return;
    activeFileImport = null;
    useAppStore.setState({ status: null, traceImport: null, error: describeError(error) });
  }
}

function updateImport(job: FileImportJob, update: Partial<TraceImportState>): void {
  if (!currentFileImport(job)) return;
  useAppStore.setState((state) => ({ traceImport: state.traceImport ? { ...state.traceImport, ...update } : null }));
}

async function finishFileImport(window: TraceWindow | null): Promise<void> {
  const job = activeFileImport;
  const pending = useAppStore.getState().traceImport;
  if (!job || !pending || !currentFileImport(job)) return;
  updateImport(job, { phase: "loading", error: null, progress: null, selectedWindow: window ?? undefined });
  useAppStore.setState({ status: `Parsing ${pending.file.name}…` });
  try {
    const previous = job.slot === "primary" ? useAppStore.getState().primarySession : useAppStore.getState().secondarySession;
    const loaded = await engineClient.parseFile(pending.file, job.slot, {
      optimized: pending.overview !== null, window: window ?? undefined,
      signal: job.controller.signal, onProgress: (progress) => updateImport(job, { progress }),
    });
    if (!currentFileImport(job)) { await engineClient.disposeSession(loaded.manifest.id); return; }
    if (previous) await engineClient.disposeSession(previous.id);
    if (!currentFileImport(job)) { await engineClient.disposeSession(loaded.manifest.id); return; }
    const next = job.slot === "primary" ? primaryModelState(loaded.projection, loaded.manifest) : {
      modelB: loaded.projection, secondarySession: loaded.manifest, status: null, view: "diff" as const,
    };
    activeFileImport = null;
    useAppStore.setState({ ...next, traceImport: null, lastTraceImport: pending.overview ? { ...pending, selectedWindow: window ?? undefined } : null });
  } catch (error) {
    if (!currentFileImport(job)) return;
    if (pending.overview) {
      updateImport(job, { phase: "choosing", error: describeError(error), progress: null });
      useAppStore.setState({ status: null });
    } else {
      activeFileImport = null;
      useAppStore.setState({ status: null, traceImport: null, error: describeError(error) });
    }
  }
}

/** The active analysis window: brush if set, else the full trace. */
export function windowOf(
  model: ParsedTraceModel,
  brush: [number, number] | null,
): [number, number] {
  return brush ?? [0, model.rangeMs];
}
