import { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { useAppStore, useHoverStore, type ViewId } from "./state/store";
import { initUrlState } from "./lib/urlState";
import { LANE_GAP, SURFACE } from "./scene/layout";
import { CameraRig } from "./scene/CameraRig";
import { CanyonScene } from "./scene/CanyonScene";
import { TerrainScene } from "./scene/TerrainScene";
import { RhythmScene } from "./scene/RhythmScene";
import { CityScene } from "./scene/CityScene";
import { DiffScene } from "./scene/DiffScene";
import { Toolbar } from "./ui/Toolbar";
import { LegendPanel } from "./ui/LegendPanel";
import { DetailsPanel } from "./ui/DetailsPanel";
import { BottomUpTable } from "./ui/BottomUpTable";
import { BrushBar } from "./ui/BrushBar";
import { Tooltip } from "./ui/Tooltip";

const VIEW_KEYS: Record<string, ViewId> = {
  "1": "canyon",
  "2": "terrain",
  "3": "rhythm",
  "4": "city",
  "5": "diff",
};

function App() {
  const model = useAppStore((s) => s.model);
  const modelB = useAppStore((s) => s.modelB);
  const view = useAppStore((s) => s.view);
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);

  useEffect(() => {
    initUrlState();
    // status is set synchronously by loadDemo, so StrictMode's second
    // mount-effect run (and any remount) skips the duplicate parse.
    const { model: loaded, status: loading } = useAppStore.getState();
    if (!loaded && !loading) void useAppStore.getState().loadDemo();
  }, []);

  useEffect(() => {
    useHoverStore.getState().setHover(null);
  }, [view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const nextView = VIEW_KEYS[event.key];
      if (nextView) useAppStore.getState().setView(nextView);
      if (event.key === "Escape") useAppStore.getState().setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const laneDepth = model ? model.lanes.length * LANE_GAP : 60;
  const worldDepth =
    view === "rhythm" ? 92 : view === "city" ? 74 : view === "diff" ? 46 : laneDepth;

  return (
    <div className="shell">
      <Toolbar />
      <div className="stage">
        <Canvas dpr={[1, 2]} gl={{ antialias: true }}>
          <color attach="background" args={[SURFACE]} />
          <ambientLight intensity={1.15} />
          <directionalLight position={[40, 70, 30]} intensity={1.6} />
          <CameraRig worldDepth={worldDepth} />
          {model && view === "canyon" && <CanyonScene model={model} />}
          {model && view === "terrain" && <TerrainScene model={model} />}
          {model && view === "rhythm" && <RhythmScene model={model} />}
          {model && view === "city" && <CityScene model={model} />}
          {model && view === "diff" && modelB && (
            <DiffScene model={model} modelB={modelB} />
          )}
        </Canvas>
        <LegendPanel />
        <DetailsPanel />
        {(view === "canyon" || view === "city") && <BottomUpTable />}
        {view !== "diff" && <BrushBar />}
        <Tooltip />
        {view === "diff" && !modelB && (
          <div className="overlay-message">
            <p>
              Diff mode compares two traces aligned at navigation start.
              <br />
              Use <strong>Compare…</strong> in the toolbar to load trace B.
            </p>
          </div>
        )}
        {status && <div className="overlay-message">{status}</div>}
        {error && (
          <div className="overlay-message error">
            <p>{error}</p>
            <button className="btn" onClick={() => useAppStore.setState({ error: null })}>
              dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
