import { memo, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { bucketize } from "../engine/aggregate";
import { formatMs } from "../scene/layout";
import { useAppStore } from "../state/store";
import { useSceneViewport } from "../scene/viewportState";
import { TIME_W } from "../scene/layout";
import type { Vector3Tuple } from "../scene/cameraActions";

const OVERVIEW_BUCKETS = 160;

/**
 * Normalized [start, end] of the camera footprint along time. The footprint
 * store publishes a fresh array on every camera frame; quantizing to 0.1%
 * and comparing shallowly keeps sub-pixel camera motion from re-rendering
 * the overview.
 */
function visibleFraction(footprint: readonly Vector3Tuple[]): [number, number] | null {
  if (footprint.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of footprint) {
    if (point[0] < min) min = point[0];
    if (point[0] > max) max = point[0];
  }
  return [Math.round((min / TIME_W) * 1000) / 1000, Math.round((max / TIME_W) * 1000) / 1000];
}

/** The 160 activity bars depend only on the model and the window, never on the camera. */
const OverviewBars = memo(function OverviewBars({
  busy,
  max,
  rangeMs,
  lo,
  hi,
}: {
  busy: Float32Array;
  max: number;
  rangeMs: number;
  lo: number;
  hi: number;
}) {
  return (
    <>
      {Array.from(busy).map((v, i) => {
        const ms = ((i + 0.5) / OVERVIEW_BUCKETS) * rangeMs;
        const inWindow = ms >= lo && ms <= hi;
        return (
          <div
            key={ms}
            className={inWindow ? "bar in" : "bar"}
            style={{ height: `${Math.max((v / max) * 100, 2)}%` }}
          />
        );
      })}
    </>
  );
});

/**
 * The profiler overview strip: drag across the mini activity chart to select
 * a window (DevTools-style); the window filters or zooms every view.
 */
export function BrushBar() {
  const model = useAppStore((s) => s.model);
  const brush = useAppStore((s) => s.brush);
  const setBrush = useAppStore((s) => s.setBrush);
  const zoomed = useAppStore((s) => s.zoomed);
  const setZoomed = useAppStore((s) => s.setZoomed);
  const visible = useSceneViewport(useShallow((s) => visibleFraction(s.footprint)));
  const view = useAppStore((s) => s.view);
  const stripRef = useRef<HTMLDivElement>(null);
  // The ref is the source of truth (pointer events can outrun renders);
  // the state mirror only drives the highlight while dragging.
  const dragStartRef = useRef<number | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);

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
  const footprintRange = view === "canyon" || view === "terrain" ? visible : null;
  const extentStart = view === "terrain" || zoomed ? t0 : 0;
  const extentEnd = view === "terrain" || zoomed ? t1 : model.rangeMs;

  const msAtClientX = (clientX: number): number => {
    const rect = stripRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const frac = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return frac * model.rangeMs;
  };

  const dragRange: [number, number] | null =
    dragStart !== null && dragCurrent !== null
      ? [Math.min(dragStart, dragCurrent), Math.max(dragStart, dragCurrent)]
      : null;

  // Touch/pen drags can end in pointercancel or lost capture, where
  // onPointerUp never fires; clear the drag so no stale highlight sticks.
  const cancelDrag = () => {
    if (dragStartRef.current === null) return;
    dragStartRef.current = null;
    setDragStart(null);
    setDragCurrent(null);
  };

  const setStart = (value: number) =>
    setBrush([Math.min(value, t1 - 1), t1]);
  const setEnd = (value: number) => setBrush([t0, Math.max(value, t0 + 1)]);

  return (
    <fieldset className="brushbar">
      <legend className="sr-only">Time brush</legend>
      <div
        ref={stripRef}
        className="overview"
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch (error) {
            if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
            console.warn("Pointer capture unavailable; brush ends on pointer up.");
          }
          const ms = msAtClientX(e.clientX);
          dragStartRef.current = ms;
          setDragStart(ms);
          setDragCurrent(ms);
        }}
        onPointerMove={(e) => {
          if (dragStartRef.current !== null) {
            setDragCurrent(msAtClientX(e.clientX));
          }
        }}
        onPointerUp={(e) => {
          const start = dragStartRef.current;
          if (start === null) return;
          const end = msAtClientX(e.clientX);
          const lo = Math.min(start, end);
          const hi = Math.max(start, end);
          // A click (no real drag) clears the window instead of selecting.
          if (hi - lo < model.rangeMs * 0.004) setBrush(null);
          else setBrush([lo, hi]);
          dragStartRef.current = null;
          setDragStart(null);
          setDragCurrent(null);
        }}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
      >
        {footprintRange && <span className="overview-viewport" aria-hidden="true" style={{ left: `${(extentStart + footprintRange[0] * (extentEnd - extentStart)) / model.rangeMs * 100}%`, width: `${(footprintRange[1] - footprintRange[0]) * (extentEnd - extentStart) / model.rangeMs * 100}%` }} />}
        <OverviewBars
          busy={overview.busy}
          max={overview.max}
          rangeMs={model.rangeMs}
          lo={dragRange ? dragRange[0] : t0}
          hi={dragRange ? dragRange[1] : t1}
        />
      </div>
      <div className="brush-controls">
        <input
          type="range"
          min={0}
          max={model.rangeMs}
          step="any"
          value={t0}
          onChange={(e) => setStart(Number(e.target.value))}
          aria-label="Window start"
        />
        <input
          type="range"
          min={0}
          max={model.rangeMs}
          step="any"
          value={t1}
          onChange={(e) => setEnd(Number(e.target.value))}
          aria-label="Window end"
        />
        <span className="window-label">
          {formatMs(t0)} – {formatMs(t1)}
          {brush ? "" : " (full trace) — drag above to select"}
        </span>
        {brush && (
          <button
            type="button"
            className={zoomed ? "btn small active" : "btn small"}
            onClick={() => setZoomed(!zoomed)}
            aria-keyshortcuts="Alt+Z"
            title="Render only the window (Alt+Z)"
          >
            {zoomed ? "zoomed" : "zoom to window"}
          </button>
        )}
        {brush && (
          <button
            type="button"
            className="btn small"
            onClick={() => setBrush(null)}
          >
            reset
          </button>
        )}
      </div>
    </fieldset>
  );
}
