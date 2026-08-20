import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import type { ParsedTraceModel } from "../engine/types";
import { rhythmFold } from "../engine/aggregate";
import { SEQUENTIAL_RAMP } from "../engine/categories";
import { useAppStore } from "../state/store";
import {
  GROUND,
  INK_MUTED,
  INK_SECONDARY,
  RHYTHM_H,
  scaleHeight,
} from "./layout";

const CELL_MS = 10;
const dummy = new THREE.Object3D();
const RAMP = SEQUENTIAL_RAMP.map((hex) => new THREE.Color(hex));

/**
 * V3 Rhythm Ridge (FlameScope in 3D): X = whole seconds, Z = ms offset within
 * the second, height/color = main-thread busy time. Periodic work aligns
 * into ridges running straight across the terrain.
 */
export function RhythmScene({ model }: { model: ParsedTraceModel }) {
  const scale = useAppStore((s) => s.scale);
  const setBrush = useAppStore((s) => s.setBrush);
  const setView = useAppStore((s) => s.setView);
  const setZoomed = useAppStore((s) => s.setZoomed);

  const mainLane = useMemo(
    () =>
      model.lanes.find((l) => l.meta.kind === "main") ?? model.lanes[0] ?? null,
    [model],
  );
  const grid = useMemo(
    () => (mainLane ? rhythmFold(mainLane, model.rangeMs, CELL_MS) : null),
    [mainLane, model.rangeMs],
  );

  const colW = grid ? Math.max(2.5, Math.min(6, 160 / grid.seconds)) : 1;
  const cellD = 0.86;
  const worldW = (grid?.seconds ?? 0) * colW;
  const worldD = (grid?.cellsPerSecond ?? 0) * cellD;
  const offsetX = (160 - worldW) / 2;

  const cells = useMemo(() => {
    if (!grid) return [];
    const list: { second: number; offset: number; busy: number }[] = [];
    for (let s = 0; s < grid.seconds; s++) {
      for (let c = 0; c < grid.cellsPerSecond; c++) {
        const busy = grid.cells[s * grid.cellsPerSecond + c];
        if (busy > 1e-4) list.push({ second: s, offset: c, busy });
      }
    }
    return list;
  }, [grid]);

  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || !grid) return;
    cells.forEach((cell, i) => {
      const h = Math.max(
        scaleHeight(cell.busy, grid.maxBusy, RHYTHM_H, scale),
        0.04,
      );
      dummy.position.set(
        cell.second * colW + colW / 2,
        h / 2,
        cell.offset * cellD + cellD / 2,
      );
      dummy.scale.set(colW * 0.82, h, cellD * 0.82);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const intensity = Math.min(
        RAMP.length - 1,
        Math.floor((cell.busy / grid.maxBusy) * (RAMP.length - 1) + 1e-6),
      );
      mesh.setColorAt(i, RAMP[intensity]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells, grid, scale, colW]);

  if (!grid) {
    return (
      <Billboard position={[80, 8, 40]}>
        <Text fontSize={1.4} color={INK_SECONDARY} anchorX="center">
          This trace has no renderable thread lanes for a rhythm fold.
        </Text>
      </Billboard>
    );
  }

  return (
    <group position={[offsetX, 0, 0]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[worldW / 2, -0.06, worldD / 2]}
      >
        <planeGeometry args={[worldW + 18, worldD + 14]} />
        <meshBasicMaterial color={GROUND} />
      </mesh>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, Math.max(cells.length, 1)]}
        frustumCulled={false}
        onClick={(event) => {
          if (event.instanceId === undefined) return;
          event.stopPropagation();
          const cell = cells[event.instanceId];
          // Jump the canyon to this exact slice of time, zoomed in.
          const start = cell.second * 1000 + cell.offset * CELL_MS - 25;
          setBrush([Math.max(0, start), Math.min(model.rangeMs, start + 60)]);
          setZoomed(true);
          setView("canyon");
        }}
      >
        <boxGeometry />
        <meshLambertMaterial />
      </instancedMesh>
      {Array.from({ length: grid.seconds + 1 }, (_, s) => (
        <Text
          key={s}
          position={[s * colW, 0.02, -1.8]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={1}
          color={INK_MUTED}
          anchorX="center"
        >
          {`${s}s`}
        </Text>
      ))}
      {[0, 250, 500, 750].map((ms) => (
        <Text
          key={ms}
          position={[-2.4, 0.02, (ms / CELL_MS) * cellD]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={1}
          color={INK_MUTED}
          anchorX="right"
        >
          {`+${ms} ms`}
        </Text>
      ))}
      <Billboard position={[worldW / 2, RHYTHM_H + 6, worldD / 2]}>
        <Text fontSize={1.15} color={INK_SECONDARY} anchorX="center">
          click a cell to open that slice in the canyon
        </Text>
      </Billboard>
    </group>
  );
}
