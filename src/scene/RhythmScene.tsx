import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ParsedTraceModel } from "../engine/types";
import { rhythmFold } from "../engine/aggregate";
import { CAT_ID, SEQUENTIAL_RAMP } from "../engine/categories";
import { useAppStore, useHoverStore } from "../state/store";
import { RHYTHM_H, formatMs, scaleHeight } from "./layout";
import { rhythmLayout, RHYTHM_CELL_MS } from "./sceneBounds";
import { ScreenLabel } from "./ScreenLabels";
import { DataMaterial } from "./DataMaterial";
import { uploadInstances, writeBox } from "./instanceBuffers";
import { BoxFeedback } from "./BoxFeedback";
import { aggregateSelectionBounds } from "./traceSelection";

const RAMP = SEQUENTIAL_RAMP.map((hex) => new THREE.Color(hex));
export function RhythmScene({ model }: { model: ParsedTraceModel }) {
  const scale = useAppStore((s) => s.scale);
  const hiddenLanes = useAppStore((s) => s.hiddenLanes);
  const brush = useAppStore((s) => s.brush);
  const selection = useAppStore((s) => s.selection);
  const selectedBounds = useMemo(() => aggregateSelectionBounds(model, selection, hiddenLanes, "rhythm", [0, model.rangeMs]), [model, selection, hiddenLanes]);
  const hoveredIndex = useHoverStore((s) => s.hover?.lane === -3 ? s.hover.idx : -1);
  const mainLane = useMemo(() => model.lanes.find((l) => l.meta.kind === "main" && !hiddenLanes.has(l.meta.id)) ?? model.lanes.find((l) => !hiddenLanes.has(l.meta.id)) ?? null, [model, hiddenLanes]);
  const grid = useMemo(() => mainLane ? rhythmFold(mainLane, model.rangeMs, RHYTHM_CELL_MS) : null, [mainLane, model.rangeMs]);
  const layout = rhythmLayout(model.rangeMs);
  const { colW, cellD, width, depth, x } = layout;
  const cells = useMemo(() => {
    if (!grid) return [];
    const list: { second: number; offset: number; busy: number }[] = [];
    for (let s = 0; s < grid.seconds; s++) for (let c = 0; c < grid.cellsPerSecond; c++) {
      const busy = grid.cells[s * grid.cellsPerSecond + c];
      if (busy > 1e-4) list.push({ second: s, offset: c, busy });
    }
    return list;
  }, [grid]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const timeRanges = useMemo(() => Float32Array.from(cells.flatMap((cell) => {
    const period = cell.second * (grid?.secondsPerColumn ?? 1) * 1000;
    return grid?.secondsPerColumn === 1 ? [period + cell.offset * grid.cellMs, period + (cell.offset + 1) * grid.cellMs] : [period, period + (grid?.secondsPerColumn ?? 1) * 1000];
  })), [cells, grid]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || !grid) return;
    cells.forEach((cell, i) => {
      const h = Math.max(scaleHeight(cell.busy, grid.maxBusy, RHYTHM_H, scale), 0.04);
      writeBox(mesh, i, (cell.second + 0.5) * colW, h / 2, (cell.offset + 0.5) * cellD, colW * 0.9, h, cellD * 0.86);
      const intensity = Math.min(RAMP.length - 1, Math.floor(cell.busy / grid.maxBusy * (RAMP.length - 1)));
      mesh.setColorAt(i, RAMP[intensity]);
    });
    uploadInstances(mesh, cells.length, { min: [0, 0, 0], max: [width, RHYTHM_H, depth] });
  }, [cells, grid, scale, colW, cellD, width, depth]);
  if (!grid) return <ScreenLabel id="rhythm-empty" position={[80, 2, 30]}>No thread activity to fold</ScreenLabel>;
  const labelStep = Math.max(1, Math.ceil(grid.seconds / 12));
  return <group position={[x, 0, 0]}>
    {selectedBounds && <group position={[-x, 0, 0]}><BoxFeedback id="rhythm-selection" bounds={selectedBounds} label="Selected calls · folded time range" /></group>}
    <instancedMesh ref={ref} name="rhythm-cells" args={[undefined, undefined, Math.max(cells.length, 1)]} count={cells.length}
      onPointerMove={(event) => {
        if (event.instanceId === undefined) return;
        event.stopPropagation();
        const cell = cells[event.instanceId];
        useHoverStore.getState().setHover({ lane: -3, idx: event.instanceId, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY,
          summary: { title: `${cell.second * grid.secondsPerColumn} s + ${cell.offset * grid.cellMs} ms`, catId: CAT_ID.loading,
            detail: `${formatMs(cell.busy)} busy across ${grid.secondsPerColumn} × ${grid.cellMs} ms intervals. Click to inspect ${grid.secondsPerColumn === 1 ? "this time slice" : "this period"}.` } });
      }}
      onPointerOut={() => useHoverStore.getState().setHover(null)}
      onClick={(event) => {
        if (event.instanceId === undefined || event.delta > 4) return;
        event.stopPropagation();
        const cell = cells[event.instanceId];
        const periodStart = cell.second * grid.secondsPerColumn * 1000;
        const start = grid.secondsPerColumn === 1 ? periodStart + cell.offset * grid.cellMs : periodStart;
        const end = grid.secondsPerColumn === 1 ? start + grid.cellMs : periodStart + grid.secondsPerColumn * 1000;
        const padding = grid.cellMs * 2;
        const state = useAppStore.getState();
        state.setBrush([Math.max(0, start - padding), Math.min(model.rangeMs, end + padding)]);
        state.setZoomed(true);
        state.setView("canyon");
      }}>
      <boxGeometry><instancedBufferAttribute attach="attributes-traceWindow" args={[timeRanges.length ? timeRanges : new Float32Array(2), 2]} /></boxGeometry><DataMaterial timeRanges brush={brush} />
    </instancedMesh>
    {cells[hoveredIndex] && <BoxFeedback id="rhythm-hover" label={`${formatMs(cells[hoveredIndex].busy)} busy`} bounds={{
      min: [(cells[hoveredIndex].second + 0.05) * colW, 0, (cells[hoveredIndex].offset + 0.07) * cellD],
      max: [(cells[hoveredIndex].second + 0.95) * colW, Math.max(0.04, scaleHeight(cells[hoveredIndex].busy, grid.maxBusy, RHYTHM_H, scale)), (cells[hoveredIndex].offset + 0.93) * cellD],
    }} />}
    {Array.from({ length: Math.floor(grid.seconds / labelStep) + 1 }, (_, i) => i * labelStep).map((s) => <ScreenLabel key={s} id={`rhythm-second-${s}`} position={[s * colW, 0.1, depth + 2]} priority={20}>{s * grid.secondsPerColumn}s</ScreenLabel>)}
    {[0, 250, 500, 750].map((ms) => <ScreenLabel key={ms} id={`rhythm-offset-${ms}`} position={[-2, 0.1, ms / grid.cellMs * cellD]} align="right" priority={30}>+{ms} ms</ScreenLabel>)}
    <ScreenLabel id="rhythm-hint" position={[width / 2, RHYTHM_H + 3, depth / 2]} priority={40}>{grid.secondsPerColumn === 1 ? "One second per column" : `${grid.secondsPerColumn} seconds per column`} · click to inspect</ScreenLabel>
  </group>;
}
