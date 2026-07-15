import { useRef } from "react";
import { useAppStore, type ViewId } from "../state/store";

const VIEWS: { id: ViewId; label: string; key: string }[] = [
  { id: "canyon", label: "Canyon", key: "1" },
  { id: "terrain", label: "Terrain", key: "2" },
  { id: "rhythm", label: "Rhythm", key: "3" },
  { id: "city", label: "City", key: "4" },
  { id: "diff", label: "Diff", key: "5" },
];

export function Toolbar() {
  const {
    view,
    setView,
    preset,
    setPreset,
    scale,
    setScale,
    model,
    loadPrimaryFile,
    loadSecondaryFile,
  } = useAppStore();
  const primaryInput = useRef<HTMLInputElement>(null);
  const secondaryInput = useRef<HTMLInputElement>(null);

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <span className="brand">Trace Topography</span>
        <nav className="tabs" aria-label="Views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={view === v.id ? "tab active" : "tab"}
              onClick={() => setView(v.id)}
              title={`${v.label} (${v.key})`}
            >
              {v.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="toolbar-group">
        <div className="segmented" role="group" aria-label="Camera">
          {(["orbit", "top", "side"] as const).map((p) => (
            <button
              key={p}
              className={preset === p ? "seg active" : "seg"}
              onClick={() => setPreset(p)}
              title={
                p === "top"
                  ? "Top view = flame chart"
                  : p === "side"
                    ? "Side view = utilization curve"
                    : "Free orbit"
              }
            >
              {p}
            </button>
          ))}
        </div>
        <button
          className="seg"
          onClick={() => setScale(scale === "linear" ? "log" : "linear")}
          title="Elevation scale"
        >
          scale: {scale}
        </button>
      </div>

      <div className="toolbar-group">
        {model && (
          <span className="stats">
            {model.lanes.reduce((a, l) => a + l.meta.entryCount, 0).toLocaleString()}{" "}
            events · {model.lanes.length}/{model.totalThreads} threads ·{" "}
            {model.parseMs} ms parse
          </span>
        )}
        <button className="btn" onClick={() => primaryInput.current?.click()}>
          Load trace
        </button>
        <button className="btn" onClick={() => secondaryInput.current?.click()}>
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
    </header>
  );
}
