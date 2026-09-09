import { CATEGORIES } from "../engine/categories";
import { formatMs } from "../scene/layout";
import { useAppStore, useHoverStore } from "../state/store";

export function Tooltip() {
  const hover = useHoverStore((s) => s.hover);
  const model = useAppStore((s) => s.model);
  if (!hover || !model) return null;

  const lane = hover.source === "canyon" ? model.lanes.find((l) => l.meta.id === hover.lane) : undefined;
  const i = hover.idx;
  if (!hover.summary && (!lane || i < 0 || i >= lane.starts.length)) return null;
  const cat = CATEGORIES[hover.summary?.catId ?? lane!.catIds[i]];

  return (
    <div
      className="tooltip"
      role="tooltip"
      style={{
        left: Math.max(8, Math.min(hover.clientX + 14, window.innerWidth - 292)),
        top: Math.max(8, Math.min(hover.clientY + 12, window.innerHeight - 140)),
      }}
    >
      <div className="tooltip-title">
        <span className="swatch" style={{ background: cat.color }} />
        {hover.summary?.title ?? model.names[lane!.nameIds[i]]}
      </div>
      <div className="tooltip-body">
        {hover.summary ? hover.summary.detail : <>
        {formatMs(lane!.durs[i])} ({formatMs(lane!.selfTimes[i])} self) ·{" "}
        {cat.label}
        <br />
        {lane!.meta.name} · depth {lane!.depths[i]} · at {formatMs(lane!.starts[i])}
        </>}
      </div>
    </div>
  );
}
