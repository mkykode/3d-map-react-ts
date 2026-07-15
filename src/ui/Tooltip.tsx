import { CATEGORIES } from "../engine/categories";
import { formatMs } from "../scene/layout";
import { useAppStore, useHoverStore } from "../state/store";

export function Tooltip() {
  const hover = useHoverStore((s) => s.hover);
  const model = useAppStore((s) => s.model);
  if (!hover || !model) return null;

  const lane = model.lanes[hover.lane];
  const i = hover.idx;
  const cat = CATEGORIES[lane.catIds[i]];

  return (
    <div
      className="tooltip"
      style={{
        left: Math.min(hover.clientX + 14, window.innerWidth - 280),
        top: Math.min(hover.clientY + 12, window.innerHeight - 120),
      }}
    >
      <div className="tooltip-title">
        <span className="swatch" style={{ background: cat.color }} />
        {model.names[lane.nameIds[i]]}
      </div>
      <div className="tooltip-body">
        {formatMs(lane.durs[i])} ({formatMs(lane.selfTimes[i])} self) ·{" "}
        {cat.label}
        <br />
        {lane.meta.name} · depth {lane.depths[i]} · at {formatMs(lane.starts[i])}
      </div>
    </div>
  );
}
