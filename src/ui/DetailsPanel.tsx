import { useMemo } from "react";
import { CATEGORIES } from "../engine/categories";
import { bottomUp } from "../engine/aggregate";
import { formatMs } from "../scene/layout";
import { useAppStore, windowOf } from "../state/store";

export function DetailsPanel() {
  const model = useAppStore((s) => s.model);
  const selection = useAppStore((s) => s.selection);
  const brush = useAppStore((s) => s.brush);
  const hiddenLanes = useAppStore((s) => s.hiddenLanes);
  const setSelection = useAppStore((s) => s.setSelection);

  const content = useMemo(() => {
    if (!model || !selection) return null;
    const navStart =
      model.markers.find((m) => m.name === "navigationStart")?.ts ?? 0;

    if (selection.kind === "entry") {
      const lane = model.lanes[selection.lane];
      const i = selection.idx;
      const callFrameId = lane.callFrameIds[i];
      const callFrame = callFrameId > 0 ? model.callFrames[callFrameId - 1] : null;
      const functionName = callFrame
        ? model.functionNames[callFrame.functionNameId]
        : null;
      const sourceUrl = callFrame ? model.scriptUrls[callFrame.urlId] : null;
      const sourcePosition =
        callFrame && callFrame.lineNumber >= 0 && callFrame.columnNumber >= 0
          ? `:${callFrame.lineNumber + 1}:${callFrame.columnNumber + 1}`
          : "";
      return {
        title: functionName ?? model.names[lane.nameIds[i]],
        catId: lane.catIds[i],
        rows: [
          ["Lane", lane.meta.name],
          ["Start", `${formatMs(lane.starts[i])} (${formatMs(lane.starts[i] - navStart)} after nav)`],
          ["Duration", formatMs(lane.durs[i])],
          ["Self time", formatMs(lane.selfTimes[i])],
          ["Stack depth", String(lane.depths[i])],
          ...(callFrame
            ? [
                ["Source", `${sourceUrl || `script ${callFrame.scriptId}`}${sourcePosition}`],
              ]
            : []),
        ] as [string, string][],
      };
    }

    const [t0, t1] = windowOf(model, brush);
    const row = bottomUp(
      model.lanes.filter((l) => !hiddenLanes.has(l.meta.id)),
      t0,
      t1,
    ).find((r) => r.nameId === selection.nameId);
    if (!row) return null;
    return {
      title: model.names[selection.nameId],
      catId: row.catId,
      rows: [
        ["Self time", formatMs(row.self)],
        ["Total time", formatMs(row.total)],
        ["Calls", row.count.toLocaleString()],
        ["Window", `${formatMs(t0)} – ${formatMs(t1)}`],
      ] as [string, string][],
    };
  }, [model, selection, brush, hiddenLanes]);

  if (!content) return null;
  const cat = CATEGORIES[content.catId];

  return (
    <aside className="panel details" aria-label="Selection details">
      <header>
        <span className="swatch" style={{ background: cat.color }} />
        <h3 title={content.title}>{content.title}</h3>
        <button className="close" onClick={() => setSelection(null)} aria-label="Clear selection">
          ×
        </button>
      </header>
      <dl>
        {content.rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">{cat.label}</p>
    </aside>
  );
}
