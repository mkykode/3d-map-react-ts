import { CATEGORIES, DIVERGING, SEQUENTIAL_RAMP, STATUS_SERIOUS } from "../engine/categories";
import { useAppStore } from "../state/store";

export function LegendPanel() {
  const view = useAppStore((s) => s.view);

  return (
    <aside className="panel legend" aria-label="Legend">
      <h3>Legend</h3>
      {view !== "rhythm" && view !== "diff" && (
        <ul className="legend-list">
          {CATEGORIES.map((cat) => (
            <li key={cat.key}>
              <span className="swatch" style={{ background: cat.color }} />
              {cat.label}
            </li>
          ))}
          <li>
            <span className="swatch" style={{ background: STATUS_SERIOUS }} />
            Long task (&gt;50 ms) / dropped frame
          </li>
        </ul>
      )}
      {view === "rhythm" && (
        <>
          <div
            className="ramp"
            style={{
              background: `linear-gradient(to right, ${SEQUENTIAL_RAMP[0]}, ${
                SEQUENTIAL_RAMP[SEQUENTIAL_RAMP.length - 1]
              })`,
            }}
          />
          <div className="ramp-labels">
            <span>idle</span>
            <span>busy</span>
          </div>
          <p className="hint">
            Each column is one second; depth is the millisecond offset inside
            that second. Aligned ridges = periodic work.
          </p>
        </>
      )}
      {view === "diff" && (
        <ul className="legend-list">
          <li>
            <span className="swatch" style={{ background: DIVERGING.regression }} />
            Regression (B slower)
          </li>
          <li>
            <span className="swatch" style={{ background: DIVERGING.neutral }} />
            No change (zero plane)
          </li>
          <li>
            <span className="swatch" style={{ background: DIVERGING.improvement }} />
            Improvement (B faster)
          </li>
        </ul>
      )}
      {view === "canyon" && (
        <p className="hint">
          Top view = flame chart. Click an event for details and causality
          arcs. W/A/S/D pans and zooms.
        </p>
      )}
      {view === "terrain" && (
        <p className="hint">
          Elevation = busy time per bucket. Red bars above the main thread
          mark tasks that ran longer than 50 ms.
        </p>
      )}
    </aside>
  );
}
