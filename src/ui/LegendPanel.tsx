import { CATEGORIES, DIVERGING, SEQUENTIAL_RAMP, STATUS_SERIOUS } from "../engine/categories";
import { useAppStore } from "../state/store";

export function LegendPanel() {
  const view = useAppStore((s) => s.view);

  return (
    <aside className="panel legend" aria-label="Legend">
      <h3>Legend</h3>
      {view === "canyon" && <p className="legend-encoding">Width: duration · height: stack<br />Thickness: self-time share</p>}
      {view !== "rhythm" && view !== "diff" && (
        <ul className="legend-list legend-categories">
          {CATEGORIES.map((cat) => (
            <li key={cat.key}>
              <span className="swatch" style={{ background: cat.color }} />
              {cat.label}
            </li>
          ))}
          {(view === "canyon" || view === "terrain") && <li>
            <span className="swatch" style={{ background: STATUS_SERIOUS, ...(view === "canyon" ? { height: 3 } : {}) }} />
            {view === "canyon" ? "Long task ≥50 ms" : "Long task / dropped frame"}
          </li>}
          {(view === "canyon" || view === "terrain") && (
            <>
              {view === "canyon" && <li>
                <span
                  className="swatch"
                  style={{ background: `repeating-linear-gradient(90deg, ${STATUS_SERIOUS} 0 3px, transparent 3px 6px)`, height: 3 }}
                />
                Blocking request
              </li>}
              <li>
                <span
                  className="swatch"
                  style={{ background: DIVERGING.neutral, opacity: 0.55 }}
                />
                <span title="Main thread idle while a render-blocking request is in flight; this is correlation, not proof of causality.">Idle + blocking request</span>
              </li>
            </>
          )}
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
            Columns fold time into seconds; long traces group seconds together.
            Depth is the millisecond offset within each second. Height and shade
            show busy time relative to the busiest cell. Aligned ridges suggest periodic work.
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
        <details className="legend-help"><summary>How to read this view</summary><p className="hint">
          In CPU lanes, thicker events spend more time executing their own work.
          Top unfolds stack rows; Side separates lanes. Deep stacks use one
          shared depth scale. White dots mark tiny selected calls. Zoom reveals smaller events; click an aggregate
          to expand it. Click an event to select;
          double-click to frame. Hover connects parent calls.
        </p></details>
      )}
      {view === "terrain" && (
        <p className="hint">
          Elevation = CPU utilization per bucket; full height = 100%.
          Bands preserve category shares. Network height is normalized to its
          peak concurrent requests. Click a bucket to inspect its time window.
        </p>
      )}
      {view === "city" && <p className="hint">Footprint = inclusive time, which can overlap between nested calls. Height = self time. The remaining activities share a labeled building. Click to select; double-click to frame.</p>}
    </aside>
  );
}
