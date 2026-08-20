import * as THREE from "three";
import { CATEGORIES, DIVERGING, SEQUENTIAL_RAMP, STATUS_SERIOUS } from "../engine/categories";
import { useAppStore } from "../state/store";

// Matches the canyon's loading-blue lerped toward status red for blocking
// requests, so the chip shows the exact rendered hue.
const BLOCKING_REQUEST_COLOR = `#${new THREE.Color(CATEGORIES[0].color)
  .lerp(new THREE.Color(STATUS_SERIOUS), 0.4)
  .getHexString()}`;

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
          {(view === "canyon" || view === "terrain") && (
            <>
              <li>
                <span
                  className="swatch"
                  style={{ background: BLOCKING_REQUEST_COLOR }}
                />
                Render-blocking request
              </li>
              <li>
                <span
                  className="swatch"
                  style={{ background: DIVERGING.neutral, opacity: 0.55 }}
                />
                Waiting on network (main idle)
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
          arcs. Trackpad scroll pans; pinch, mouse wheel, or W/S zooms. A/D and
          arrow keys pan in the selected XY, XZ, or YZ world plane when the 3D
          view is focused; Shift moves faster and Alt moves precisely.
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
