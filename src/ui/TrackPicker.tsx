import { defaultHiddenLanes, useAppStore } from "../state/store";

/**
 * The profiler track list: choose which threads feed the 3D scene, like
 * expanding/collapsing tracks in the DevTools Performance panel.
 */
export function TrackPicker() {
  const model = useAppStore((s) => s.model);
  const hiddenLanes = useAppStore((s) => s.hiddenLanes);
  const toggleLane = useAppStore((s) => s.toggleLane);
  const setHiddenLanes = useAppStore((s) => s.setHiddenLanes);
  const open = useAppStore((s) => s.trackPickerOpen);
  const toggleOpen = useAppStore((s) => s.toggleTrackPicker);

  if (!model || !open) return null;

  const showAll = () => setHiddenLanes(new Set());
  const showMainOnly = () =>
    setHiddenLanes(
      new Set(
        model.lanes
          .filter((l) => l.meta.kind !== "main" && l.meta.kind !== "network")
          .map((l) => l.meta.id),
      ),
    );
  const showDefault = () => setHiddenLanes(defaultHiddenLanes(model));

  return (
    <aside id="track-picker" className="panel tracks" aria-label="Tracks">
      <header>
        <h3>Tracks ({model.lanes.length - hiddenLanes.size}/{model.lanes.length})</h3>
        <button className="close" onClick={toggleOpen} aria-label="Close tracks">
          ×
        </button>
      </header>
      <div className="track-actions">
        <button className="btn small" onClick={showAll}>
          all
        </button>
        <button className="btn small" onClick={showMainOnly}>
          main + network
        </button>
        <button className="btn small" onClick={showDefault}>
          default
        </button>
      </div>
      <ul className="track-list">
        {model.lanes.map((lane) => (
          <li key={lane.meta.id}>
            <label>
              <input
                type="checkbox"
                checked={!hiddenLanes.has(lane.meta.id)}
                onChange={() => toggleLane(lane.meta.id)}
              />
              <span className="track-name" title={lane.meta.name}>
                {lane.meta.name}
              </span>
              <span className="track-count">
                {lane.meta.entryCount.toLocaleString()}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </aside>
  );
}
