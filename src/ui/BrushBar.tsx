import { useMemo } from "react";
import { bucketize } from "../engine/aggregate";
import { formatMs } from "../scene/layout";
import { useAppStore } from "../state/store";

const OVERVIEW_BUCKETS = 160;

/**
 * Time brush with a mini activity overview. The brushed window filters the
 * terrain, city, bottom-up table, and dims the canyon outside it.
 */
export function BrushBar() {
  const model = useAppStore((s) => s.model);
  const brush = useAppStore((s) => s.brush);
  const setBrush = useAppStore((s) => s.setBrush);

  const overview = useMemo(() => {
    if (!model) return null;
    const main = model.lanes.find((l) => l.meta.kind === "main");
    if (!main) return null;
    const grid = bucketize([main], 0, model.rangeMs, OVERVIEW_BUCKETS);
    const busy = grid.lanes[0].busy;
    let max = 0;
    for (const v of busy) if (v > max) max = v;
    return { busy, max: Math.max(max, 1e-3) };
  }, [model]);

  if (!model || !overview) return null;
  const t0 = brush?.[0] ?? 0;
  const t1 = brush?.[1] ?? model.rangeMs;

  const setStart = (value: number) =>
    setBrush([Math.min(value, t1 - 1), t1]);
  const setEnd = (value: number) => setBrush([t0, Math.max(value, t0 + 1)]);

  return (
    <div className="brushbar" aria-label="Time brush">
      <div className="overview">
        {Array.from(overview.busy).map((v, i) => {
          const ms = (i / OVERVIEW_BUCKETS) * model.rangeMs;
          const inWindow = ms >= t0 && ms <= t1;
          return (
            <div
              key={i}
              className={inWindow ? "bar in" : "bar"}
              style={{ height: `${Math.max((v / overview.max) * 100, 2)}%` }}
            />
          );
        })}
      </div>
      <div className="brush-controls">
        <input
          type="range"
          min={0}
          max={model.rangeMs}
          step={model.rangeMs / 500}
          value={t0}
          onChange={(e) => setStart(Number(e.target.value))}
          aria-label="Window start"
        />
        <input
          type="range"
          min={0}
          max={model.rangeMs}
          step={model.rangeMs / 500}
          value={t1}
          onChange={(e) => setEnd(Number(e.target.value))}
          aria-label="Window end"
        />
        <span className="window-label">
          {formatMs(t0)} – {formatMs(t1)}
        </span>
        {brush && (
          <button className="btn small" onClick={() => setBrush(null)}>
            reset
          </button>
        )}
      </div>
    </div>
  );
}
