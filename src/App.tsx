import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { useAppStore, useHoverStore, type ViewId } from "./state/store";
import { initUrlState } from "./lib/urlState";
import { sceneBounds } from "./scene/sceneBounds";
import { SceneEnvironment } from "./scene/SceneEnvironment";
import { LabelLayer } from "./scene/ScreenLabels";
import { CameraFootprint } from "./scene/CameraFootprint";
import { SCENE_DEBUG } from "./scene/diagnostics";
import { regressionProjectionBounds } from "./scene/regressionPicking";
import { diffProjectionBounds } from "./scene/diffLayout";
import { SceneBoundary } from "./ui/SceneBoundary";
import { scenePointerEvents } from "./scene/pointerEvents";
import { ShaderWarmup } from "./scene/ShaderWarmup";
import { CameraRig } from "./scene/CameraRig";
import { Minimap } from "./scene/Minimap";
import { RenderActivity } from "./scene/RenderActivity";
import {
  CAMERA_ARIA_KEYSHORTCUTS,
  isEditableKeyboardTarget,
} from "./scene/cameraActions";
import { CanyonScene } from "./scene/CanyonScene";
import { TerrainScene } from "./scene/TerrainScene";
import { RhythmScene } from "./scene/RhythmScene";
import { CityScene } from "./scene/CityScene";
import { DiffScene } from "./scene/DiffScene";
import { RegressionScene } from "./scene/RegressionScene";
import { Toolbar } from "./ui/Toolbar";
import { LegendPanel } from "./ui/LegendPanel";
import { DetailsPanel } from "./ui/DetailsPanel";
import { BottomUpTable } from "./ui/BottomUpTable";
import { BrushBar } from "./ui/BrushBar";
import { Tooltip } from "./ui/Tooltip";
import { TrackPicker } from "./ui/TrackPicker";
import { HudPanel } from "./ui/HudPanel";
import { WebVitalsView } from "./ui/WebVitalsView";
import { ExperimentImport } from "./ui/ExperimentImport";
import type { FindingId } from "./domain/analysis";
import type { RegressionProjection } from "./engine/findingContract";

// Keyed by KeyboardEvent.code: Option-modified keys produce remapped
// characters on macOS (Option+1 is "¡"), so Alt shortcuts must match the
// physical key position, not the produced character.
const VIEW_KEYS: Record<string, ViewId> = {
  Digit1: "canyon",
  Digit2: "terrain",
  Digit3: "rhythm",
  Digit4: "city",
  Digit5: "diff",
  Digit6: "vitals",
};

function App() {
  const model = useAppStore((s) => s.model);
  const view = useAppStore((s) => s.view);
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const findingProjection = useAppStore((s) => s.analysisFindingProjection);
  const regressionProjection = useAppStore(
    (s) => s.analysisRegressionProjection,
  );
  const selectedFindingId = useAppStore(
    (s) => s.analysisScope?.selectedFindingId ?? null,
  );
  const selectedEvidenceId = useAppStore(
    (s) => s.analysisScope?.selectedEvidenceId ?? null,
  );
  const selectAnalysisFinding = useAppStore((s) => s.selectAnalysisFinding);

  useEffect(() => {
    initUrlState();
    // status is set synchronously by loadDemo, so StrictMode's second
    // mount-effect run (and any remount) skips the duplicate parse.
    const { model: loaded, status: loading } = useAppStore.getState();
    if (!loaded && !loading) void useAppStore.getState().loadDemo();
  }, []);

  useEffect(() => {
    useHoverStore.getState().setHover(null);
    if (view !== "diff") {
      const host = document.getElementById("trace-camera");
      if (host) {
        for (const key of [
          "regressionPickX",
          "regressionPickY",
          "regressionPickContributor",
          "regressionPickEvidence",
          "regressionSelectedContributor",
          "regressionSelectedEvidence",
        ]) {
          delete host.dataset[key];
        }
      }
    }
  }, [view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        isEditableKeyboardTarget(target)
      ) {
        return;
      }
      if (event.key === "Escape") {
        useAppStore.getState().setSelection(null);
        return;
      }
      if (!event.altKey) return;
      const nextView = VIEW_KEYS[event.code];
      if (nextView) useAppStore.getState().setView(nextView);
      if (event.code === "KeyZ") {
        const state = useAppStore.getState();
        if (state.brush) state.setZoomed(!state.zoomed);
      }
      if (event.code === "KeyI") useAppStore.getState().toggleHud();
      if (event.code === "KeyT") useAppStore.getState().toggleTrackPicker();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hiddenLanes = useAppStore((s) => s.hiddenLanes);
  const preset = useAppStore((s) => s.preset);
  const bounds = useMemo(() => view === "diff" && regressionProjection ? regressionProjectionBounds(regressionProjection.marks) : view === "diff" && findingProjection ? diffProjectionBounds(findingProjection.marks) : sceneBounds(model, view, hiddenLanes, preset), [model, view, hiddenLanes, preset, regressionProjection, findingProjection]);
  const worldDepth = bounds.max[2];

  return (
    <div className="shell">
      <Toolbar />
      <main className="stage">
        <ExperimentImport />
        {model && view === "vitals" ? (
          <WebVitalsView model={model} />
        ) : (
          <>
            <p id="camera-instructions" className="sr-only">
              Interactive 3D trace. Trackpad scroll or arrow keys pan. Pinch,
              mouse wheel, W, or S zoom. In orbit mode, Q and E rotate while R
              and F tilt. Home fits all, Shift+Home fits the selection, and 0
              resets. Keyboard commands work while this view is focused.
            </p>
            <SceneBoundary><Canvas
              id="trace-camera"
              role="application"
              aria-label={
                view === "diff" && regressionProjection
                  ? regressionStageLabel(regressionProjection, selectedFindingId)
                  : view === "diff" && selectedEvidenceId
                    ? `Interactive 3D findings. Selected evidence ${selectedEvidenceId}`
                  : "Interactive 3D trace"
              }
              aria-describedby="camera-instructions"
              aria-keyshortcuts={CAMERA_ARIA_KEYSHORTCUTS}
              tabIndex={0}
              frameloop="demand"
              events={scenePointerEvents}
              flat
              dpr={[1, 2]}
              gl={{ antialias: true }}
              onPointerMissed={(event) => { if (event.type === "click") useAppStore.getState().setSelection(null); }}
            >
              <SceneEnvironment bounds={bounds} />
              {SCENE_DEBUG && <RenderActivity hostId="trace-camera" />}
              <CameraRig bounds={bounds} />
              <CameraFootprint bounds={bounds} side={preset === "side"} />
              <LabelLayer>
                {model && view === "canyon" && <CanyonScene model={model} />}
                {model && view === "terrain" && <TerrainScene model={model} />}
                {model && view === "rhythm" && <RhythmScene model={model} />}
                {model && view === "city" && <CityScene model={model} />}
                {view === "diff" && regressionProjection && (
                  <RegressionScene
                    projection={regressionProjection}
                    selectedFindingId={selectedFindingId}
                    onSelect={(mark) =>
                      selectAnalysisFinding(mark.findingId, mark.evidenceId)}
                  />
                )}
                {view === "diff" && !regressionProjection && findingProjection && (
                  <DiffScene
                    projection={findingProjection}
                    selectedEvidenceId={selectedEvidenceId}
                    onSelect={(mark) =>
                      selectAnalysisFinding(mark.findingId, mark.evidenceId)}
                  />
                )}
              </LabelLayer>
              <ShaderWarmup token={`${view}-${model?.boundsMinUs ?? "empty"}`} />
            </Canvas></SceneBoundary>
            <Minimap worldDepth={worldDepth} />
            <LegendPanel />
            <DetailsPanel />
            <TrackPicker />
            <HudPanel />
            {(view === "canyon" || view === "city") && <BottomUpTable />}
            {view !== "diff" && <BrushBar />}
            <Tooltip />
          </>
        )}
        {view === "diff" && !regressionProjection && !findingProjection && (
          <div className="overlay-message">
            <p>
              Diff mode renders bounded worker-ranked findings.
              <br />
              Import and analyze a controlled experiment to populate this view.
            </p>
          </div>
        )}
        <div
          id="app-status"
          className={status ? "overlay-message" : "sr-only"}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {status ?? ""}
        </div>
        <div
          id="app-error"
          className={error ? "overlay-message error" : "sr-only"}
          role="alert"
          aria-atomic="true"
        >
          {error ? (
            <>
              <p>{error}</p>
              <button
                type="button"
                className="btn"
                onClick={() => useAppStore.setState({ error: null })}
              >
                dismiss
              </button>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default App;

function regressionStageLabel(
  projection: RegressionProjection,
  selectedFindingId: FindingId | null,
): string {
  const selected = projection.marks.find(
    (mark) => mark.findingId === selectedFindingId,
  );
  const scaleSummary = Object.values(projection.scales)
    .map((scale) => `${scale.markKind} scale in ${scale.unit}`)
    .join(", ");
  const gaps = projection.marks.filter((mark) => mark.gap).length;
  return [
    `Interactive 3D regression overview with ${projection.marks.length} selectable marks`,
    scaleSummary,
    `${gaps} explicit ${gaps === 1 ? "gap" : "gaps"}; no causal edges`,
    selected
      ? `Selected finding ${selected.title}. Selected evidence ${selected.evidenceId}, contributor ${selected.contributorId}`
      : "No finding selected",
  ].join(". ");
}
