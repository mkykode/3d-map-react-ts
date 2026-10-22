import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore, VIEW_IDS } from "../state/store";

const VIEWS = VIEW_IDS.map((id, i) => ({ id, label: id[0].toUpperCase() + id.slice(1), key: String(i + 1) }));

export function Toolbar() {
  const {
    view,
    setView,
    scale,
    setScale,
    model,
    loadPrimaryFile,
    loadSecondaryFile,
    hudOpen,
    toggleHud,
    trackPickerOpen,
    toggleTrackPicker,
  } = useAppStore(useShallow((s) => ({
    view: s.view, setView: s.setView, scale: s.scale, setScale: s.setScale,
    model: s.model, loadPrimaryFile: s.loadPrimaryFile, loadSecondaryFile: s.loadSecondaryFile,
    hudOpen: s.hudOpen, toggleHud: s.toggleHud, trackPickerOpen: s.trackPickerOpen,
    toggleTrackPicker: s.toggleTrackPicker,
  })));
  const primaryInput = useRef<HTMLInputElement>(null);
  const connectionsVisible = useAppStore((s) => s.connectionsVisible);
  const supportsScale = view === "system" || view === "terrain" || view === "city" || view === "rhythm";
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
        {view === "canyon" && <button className="seg" aria-pressed={connectionsVisible} onClick={() => useAppStore.getState().toggleConnections()}>Connections</button>}
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
