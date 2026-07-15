import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import type { ParsedTraceModel } from "../engine/types";
import { bottomUp } from "../engine/aggregate";
import { useAppStore, useHoverStore, windowOf } from "../state/store";
import { squarify } from "../lib/treemap";
import {
  CAT_COLORS,
  CITY_H,
  DIM_TARGET,
  INK_MUTED,
  INK_SECONDARY,
  scaleHeight,
} from "./layout";

const CITY_SIZE = 70;
const MAX_BUILDINGS = 60;
const LABELED = 8;
const dummy = new THREE.Object3D();
const color = new THREE.Color();

/**
 * V4 Hotspot City: bottom-up aggregation as a skyline. Footprint = call
 * count, height = total self time, color = category. Click a building to
 * light its call sites up in the canyon.
 */
export function CityScene({ model }: { model: ParsedTraceModel }) {
  const brush = useAppStore((s) => s.brush);
  const scale = useAppStore((s) => s.scale);
  const selection = useAppStore((s) => s.selection);
  const setSelection = useAppStore((s) => s.setSelection);
  const setHover = useHoverStore((s) => s.setHover);
  const [t0, t1] = windowOf(model, brush);

  const { buildings, folded } = useMemo(() => {
    const rows = bottomUp(model.lanes, t0, t1).filter((r) => r.self > 0);
    const kept = rows.slice(0, MAX_BUILDINGS);
    const rects = squarify(
      kept.map((r) => Math.max(r.count, 1)),
      CITY_SIZE,
      CITY_SIZE,
    );
    const maxSelf = kept.length > 0 ? kept[0].self : 1;
    return {
      buildings: kept.map((row, i) => ({ row, rect: rects[i], maxSelf })),
      folded: rows.length - kept.length,
    };
  }, [model, t0, t1]);

  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    buildings.forEach(({ row, rect, maxSelf }, i) => {
      const h = Math.max(
        scaleHeight(row.self, maxSelf, CITY_H, scale),
        0.15,
      );
      dummy.position.set(
        rect.x + rect.w / 2,
        h / 2,
        rect.y + rect.h / 2,
      );
      dummy.scale.set(Math.max(rect.w - 0.35, 0.2), h, Math.max(rect.h - 0.35, 0.2));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.copy(CAT_COLORS[row.catId]);
      if (selection?.kind === "name" && selection.nameId !== row.nameId) {
        color.lerp(DIM_TARGET, 0.75);
      }
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [buildings, scale, selection]);

  return (
    <group position={[45, 0, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CITY_SIZE / 2, -0.05, CITY_SIZE / 2]}>
        <planeGeometry args={[CITY_SIZE + 16, CITY_SIZE + 16]} />
        <meshBasicMaterial color="#101216" />
      </mesh>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, buildings.length]}
        frustumCulled={false}
        onPointerMove={(event) => {
          if (event.instanceId === undefined) return;
          const b = buildings[event.instanceId];
          const laneIdx = findFirstInstance(model, b.row.nameId);
          if (laneIdx) {
            setHover({
              ...laneIdx,
              clientX: event.nativeEvent.clientX,
              clientY: event.nativeEvent.clientY,
            });
          }
        }}
        onPointerOut={() => setHover(null)}
        onClick={(event) => {
          if (event.instanceId === undefined) return;
          event.stopPropagation();
          setSelection({ kind: "name", nameId: buildings[event.instanceId].row.nameId });
        }}
      >
        <boxGeometry />
        <meshLambertMaterial />
      </instancedMesh>
      {buildings.slice(0, LABELED).map(({ row, rect, maxSelf }) => (
        <Billboard
          key={row.nameId}
          position={[
            rect.x + rect.w / 2,
            scaleHeight(row.self, maxSelf, CITY_H, scale) + 1.3,
            rect.y + rect.h / 2,
          ]}
        >
          <Text fontSize={1.05} color={INK_SECONDARY} anchorX="center" maxWidth={22}>
            {shorten(model.names[row.nameId])}
          </Text>
        </Billboard>
      ))}
      {folded > 0 && (
        <Billboard position={[CITY_SIZE / 2, 1.4, CITY_SIZE + 7]}>
          <Text fontSize={1.15} color={INK_MUTED} anchorX="center">
            {`top ${MAX_BUILDINGS} of ${MAX_BUILDINGS + folded} activities by self time`}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

function shorten(name: string): string {
  return name.length > 26 ? `${name.slice(0, 24)}…` : name;
}

function findFirstInstance(
  model: ParsedTraceModel,
  nameId: number,
): { lane: number; idx: number } | null {
  for (const lane of model.lanes) {
    for (let i = 0; i < lane.nameIds.length; i++) {
      if (lane.nameIds[i] === nameId) return { lane: lane.meta.id, idx: i };
    }
  }
  return null;
}
