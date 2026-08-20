import { useMemo } from "react";
import {
  bottomUp,
  computeStalls,
  exclusiveTimeInWindow,
  windowSlice,
} from "../engine/aggregate";
import { CATEGORIES } from "../engine/categories";
import { formatMs } from "../scene/layout";
import { useAppStore, windowOf } from "../state/store";

/**
 * Inspector HUD: a toggleable overlay that live-updates with the story of
 * whatever window you are zoomed or brushed into.
 */
export function HudPanel() {
  const model = useAppStore((s) => s.model);
  const brush = useAppStore((s) => s.brush);
  const hiddenLanes = useAppStore((s) => s.hiddenLanes);
  const open = useAppStore((s) => s.hudOpen);

  const stats = useMemo(() => {
    if (!model || !open) return null;
    const [t0, t1] = windowOf(model, brush);
    const visible = model.lanes.filter((l) => !hiddenLanes.has(l.meta.id));

    let events = 0;
    const catSelf = new Float64Array(CATEGORIES.length);
    for (const lane of visible) {
      const { lo, hi } = windowSlice(lane, t0, t1);
      for (let i = lo; i < hi; i++) {
        const start = lane.starts[i];
        const dur = lane.durs[i];
        if (start + dur < t0 || start > t1) continue;
        events++;
        catSelf[lane.catIds[i]] += exclusiveTimeInWindow(lane, i, t0, t1);
      }
    }
    const topCats = [...catSelf.entries()]
      .map(([catId, self]) => ({ catId, self }))
      .filter((c) => c.self > 0.5)
      .sort((a, b) => b.self - a.self)
      .slice(0, 3);

    const topActivities = bottomUp(visible, t0, t1).slice(0, 3);

    const main = model.lanes.find((l) => l.meta.kind === "main");
    let longTasks = 0;
    if (main) {
      for (let i = 0; i < main.starts.length; i++) {
        if (
          main.depths[i] === 0 &&
          main.durs[i] >= 50 &&
          main.starts[i] + main.durs[i] >= t0 &&
          main.starts[i] <= t1
        ) {
          longTasks++;
        }
      }
    }

    const requests = model.requests.filter((r) => r.end >= t0 && r.start <= t1);
    const blocking = requests.filter((r) => r.renderBlocking);
    const stallMs = computeStalls(main, model.requests, t0, t1).reduce(
      (acc, band) => acc + (band.end - band.start),
      0,
    );
    const vitals = model.markers.filter((m) => m.ts >= t0 && m.ts <= t1);

    return {
      t0,
      t1,
      events,
      topCats,
      topActivities,
      longTasks,
      requests: requests.length,
      blocking: blocking.length,
      stallMs,
      vitals,
      names: model.names,
    };
  }, [model, brush, hiddenLanes, open]);

  if (!stats) return null;

  return (
    <aside id="window-inspector" className="panel hud" aria-label="Window inspector">
      <h3>
        Window · {formatMs(stats.t0)} – {formatMs(stats.t1)} (
        {formatMs(stats.t1 - stats.t0)})
      </h3>
      <dl>
        <div>
          <dt>Events</dt>
          <dd>{stats.events.toLocaleString()}</dd>
        </div>
        {stats.topCats.map(({ catId, self }) => (
          <div key={catId}>
            <dt>
              <span
                className="swatch"
                style={{ background: CATEGORIES[catId].color }}
              />
              {CATEGORIES[catId].label}
            </dt>
            <dd>{formatMs(self)}</dd>
          </div>
        ))}
        <div>
          <dt>Long tasks</dt>
          <dd>{stats.longTasks}</dd>
        </div>
        <div>
          <dt>Requests</dt>
          <dd>
            {stats.requests} ({stats.blocking} blocking)
          </dd>
        </div>
        {stats.stallMs > 0 && (
          <div>
            <dt>Network stall</dt>
            <dd>{formatMs(stats.stallMs)}</dd>
          </div>
        )}
        {stats.vitals.length > 0 && (
          <div>
            <dt>Vitals</dt>
            <dd>{stats.vitals.map((v) => v.label).join(" · ")}</dd>
          </div>
        )}
      </dl>
      {stats.topActivities.length > 0 && (
        <>
          <h3 className="hud-subhead">Hottest here</h3>
          <ul className="hud-list">
            {stats.topActivities.map((row) => (
              <li key={row.nameId}>
                <span
                  className="swatch"
                  style={{ background: CATEGORIES[row.catId].color }}
                />
                <span className="name" title={stats.names[row.nameId]}>
                  {stats.names[row.nameId]}
                </span>
                <span>{formatMs(row.self)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
