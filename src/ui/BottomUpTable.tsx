import { useMemo, useState } from "react";
import { CATEGORIES } from "../engine/categories";
import { bottomUp } from "../engine/aggregate";
import { formatMs } from "../scene/layout";
import { useAppStore, windowOf } from "../state/store";

const ROWS = 14;

/** Linked bottom-up table: rows select by name across every 3D view. */
export function BottomUpTable() {
  const model = useAppStore((s) => s.model);
  const brush = useAppStore((s) => s.brush);
  const selection = useAppStore((s) => s.selection);
  const setSelection = useAppStore((s) => s.setSelection);
  const [open, setOpen] = useState(true);

  const { rows, folded } = useMemo(() => {
    if (!model) return { rows: [], folded: 0 };
    const [t0, t1] = windowOf(model, brush);
    const all = bottomUp(model.lanes, t0, t1);
    return { rows: all.slice(0, ROWS), folded: all.length - ROWS };
  }, [model, brush]);

  if (!model) return null;
  const [t0, t1] = windowOf(model, brush);

  return (
    <aside className={open ? "panel bottomup" : "panel bottomup collapsed"}>
      <header>
        <h3>
          Bottom-up · {formatMs(t0)} – {formatMs(t1)}
        </h3>
        <button className="close" onClick={() => setOpen(!open)} aria-label="Toggle table">
          {open ? "–" : "+"}
        </button>
      </header>
      {open && (
        <table>
          <thead>
            <tr>
              <th>Activity</th>
              <th>Self</th>
              <th>Total</th>
              <th>Calls</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.nameId}
                className={
                  selection?.kind === "name" && selection.nameId === row.nameId
                    ? "selected"
                    : undefined
                }
                onClick={() =>
                  setSelection(
                    selection?.kind === "name" && selection.nameId === row.nameId
                      ? null
                      : { kind: "name", nameId: row.nameId },
                  )
                }
              >
                <td>
                  <span
                    className="swatch"
                    style={{ background: CATEGORIES[row.catId].color }}
                  />
                  <span className="name" title={model.names[row.nameId]}>
                    {model.names[row.nameId]}
                  </span>
                </td>
                <td>{formatMs(row.self)}</td>
                <td>{formatMs(row.total)}</td>
                <td>{row.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && folded > 0 && (
        <p className="hint">top {ROWS} by self time · {folded} more not shown</p>
      )}
    </aside>
  );
}
