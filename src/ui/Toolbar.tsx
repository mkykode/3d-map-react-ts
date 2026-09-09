import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { PAN_PLANE_AXES, PAN_PLANES } from "../scene/cameraNavigation";
import {
  CAMERA_CONTROL_DESCRIPTORS,
  CAMERA_PRESETS,
} from "../scene/cameraActions";
import { useAppStore, type ViewId } from "../state/store";
import { CameraControls } from "./CameraControls";

const VIEWS: { id: ViewId; label: string; key: string }[] = [
  { id: "canyon", label: "Canyon", key: "1" },
  { id: "terrain", label: "Terrain", key: "2" },
  { id: "rhythm", label: "Rhythm", key: "3" },
  { id: "city", label: "City", key: "4" },
  { id: "diff", label: "Diff", key: "5" },
  { id: "vitals", label: "Vitals", key: "6" },
];

export function Toolbar() {
  const {
    view,
    setView,
    preset,
    setPreset,
    panPlane,
    setPanPlane,
    scale,
    setScale,
    model,
    loadPrimaryFile,
    loadSecondaryFile,
    hudOpen,
    toggleHud,
    trackPickerOpen,
    toggleTrackPicker,
    dispatchCameraInput,
  } = useAppStore(useShallow((s) => ({
    view: s.view, setView: s.setView, preset: s.preset, setPreset: s.setPreset,
    panPlane: s.panPlane, setPanPlane: s.setPanPlane, scale: s.scale, setScale: s.setScale,
    model: s.model, loadPrimaryFile: s.loadPrimaryFile, loadSecondaryFile: s.loadSecondaryFile,
    hudOpen: s.hudOpen, toggleHud: s.toggleHud, trackPickerOpen: s.trackPickerOpen,
    toggleTrackPicker: s.toggleTrackPicker, dispatchCameraInput: s.dispatchCameraInput,
  })));
  const primaryInput = useRef<HTMLInputElement>(null);
  const supportsScale = view === "terrain" || view === "city" || view === "rhythm";
  const secondaryInput = useRef<HTMLInputElement>(null);
  // Collapsed by default on phone widths so the header never buries the scene.
  const [controlsOpen, setControlsOpen] = useState(
    () => window.matchMedia("(min-width: 701px)").matches,
  );

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <span className="brand">Trace Topography</span>
        <nav className="tabs" aria-label="Views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={view === v.id ? "tab active" : "tab"}
              aria-current={view === v.id ? "page" : undefined}
              aria-keyshortcuts={`Alt+${v.key}`}
              onClick={() => setView(v.id)}
              title={`${v.label} (Alt+${v.key})`}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="toolbar-toggle"
          aria-label="Toolbar controls"
          aria-expanded={controlsOpen}
          aria-controls="toolbar-controls"
          onClick={() => setControlsOpen((open) => !open)}
          title={controlsOpen ? "Hide controls" : "Show controls"}
        >
          <span aria-hidden="true">{controlsOpen ? "▴" : "▾"}</span>
        </button>
      </div>

      <div id="toolbar-controls" className="toolbar-controls">
      {controlsOpen && view !== "vitals" && (
        <div className="toolbar-group">
        <fieldset className="segmented">
          <legend className="sr-only">Camera</legend>
          {CAMERA_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={preset === p ? "seg active" : "seg"}
              aria-pressed={preset === p}
              onClick={() => setPreset(p)}
              title={
                p === "top"
                  ? "Top view = flame chart"
                  : p === "side"
                    ? "Side view = separated stack profiles"
                    : "Free orbit"
              }
            >
              {preset === p ? <span aria-hidden="true">✓ </span> : null}
              {p}
            </button>
          ))}
        </fieldset>
        <fieldset className="segmented">
          <legend className="sr-only">World pan plane</legend>
          {PAN_PLANES.map((plane) => {
            const [horizontalAxis, verticalAxis] = PAN_PLANE_AXES[plane];
            return (
              <button
                key={plane}
                type="button"
                className={panPlane === plane ? "seg active" : "seg"}
                aria-pressed={panPlane === plane}
                onClick={() => setPanPlane(plane)}
                title={`Pan ${plane.toUpperCase()}: A/D or Left/Right moves ${horizontalAxis.toUpperCase()}; Up/Down moves ${verticalAxis.toUpperCase()}`}
              >
                {panPlane === plane ? <span aria-hidden="true">✓ </span> : null}
                pan {plane.toUpperCase()}
              </button>
            );
          })}
        </fieldset>
        <fieldset className="segmented camera-commands">
          <legend className="sr-only">Camera position</legend>
          {CAMERA_CONTROL_DESCRIPTORS.filter((control) => !control.orbitOnly).map((control) => (
            <button
              key={control.id}
              type="button"
              className="seg camera-command"
              aria-label={control.label}
              aria-controls="trace-camera"
              aria-keyshortcuts={control.key}
              onClick={() => dispatchCameraInput(control.command)}
              title={`${control.label} (${control.key})`}
            >
              {control.symbol}
            </button>
          ))}
        </fieldset>
        {preset === "orbit" && (
          <fieldset className="segmented camera-commands">
            <legend className="sr-only">Camera rotation</legend>
            {CAMERA_CONTROL_DESCRIPTORS.filter((control) => control.orbitOnly).map((control) => (
              <button
                key={control.id}
                type="button"
                className="seg camera-command camera-command-wide"
                aria-label={control.label}
                aria-controls="trace-camera"
                aria-keyshortcuts={control.key}
                onClick={() => dispatchCameraInput(control.command)}
                title={`${control.label} (${control.key.toUpperCase()})`}
              >
                {control.symbol}
              </button>
            ))}
          </fieldset>
        )}
        <CameraControls />
        <button
          type="button"
          className="seg"
          onClick={() => setScale(scale === "linear" ? "log" : "linear")}
          disabled={!supportsScale}
          title={supportsScale ? "Elevation scale" : "This view uses a fixed linear scale"}
        >
          scale: {supportsScale ? scale : "linear"}
        </button>
        <button
          type="button"
          className={trackPickerOpen ? "seg active" : "seg"}
          aria-expanded={trackPickerOpen}
          aria-controls="track-picker"
          aria-keyshortcuts="Alt+T"
          onClick={toggleTrackPicker}
          title="Choose which threads render (Alt+T)"
        >
          tracks
        </button>
        <button
          type="button"
          className={hudOpen ? "seg active" : "seg"}
          aria-expanded={hudOpen}
          aria-controls="window-inspector"
          aria-keyshortcuts="Alt+I"
          onClick={toggleHud}
          title="Window inspector overlay (Alt+I)"
        >
          inspector
        </button>
        </div>
      )}

      {controlsOpen && (
      <div className="toolbar-group">
        {model && (
          <span className="stats">
            {model.lanes.reduce((a, l) => a + l.meta.entryCount, 0).toLocaleString()}{" "}
            events · {model.lanes.length}/{model.totalThreads} threads ·{" "}
            {model.parseMs} ms parse
          </span>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => primaryInput.current?.click()}
        >
          Load trace
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => secondaryInput.current?.click()}
        >
          Compare…
        </button>
        <input
          ref={primaryInput}
          type="file"
          accept=".json,.gz"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadPrimaryFile(file);
            e.target.value = "";
          }}
        />
        <input
          ref={secondaryInput}
          type="file"
          accept=".json,.gz"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadSecondaryFile(file);
            e.target.value = "";
          }}
        />
      </div>
      )}
      </div>
    </header>
  );
}
