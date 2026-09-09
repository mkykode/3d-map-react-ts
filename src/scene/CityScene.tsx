import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ContactShadows } from "@react-three/drei";
import type { ParsedTraceModel } from "../engine/types";
import { useAppStore, useHoverStore, windowOf } from "../state/store";
import { CAT_COLORS, CITY_H, scaleHeight, formatMs } from "./layout";
import { cityBuildingForName, cityBuildings } from "./cityLayout";
import { CITY_SIZE, CITY_X } from "./sceneBounds";
import { DataMaterial } from "./DataMaterial";
import { ScreenLabel } from "./ScreenLabels";
import { uploadInstances, writeBox } from "./instanceBuffers";
import { BoxFeedback } from "./BoxFeedback";
import { selectionNameId } from "./traceSelection";

export function CityScene({ model }: { model: ParsedTraceModel }) {
  const brush = useAppStore((s) => s.brush);
  const scale = useAppStore((s) => s.scale);
  const hiddenLanes = useAppStore((s) => s.hiddenLanes);
  const selectedName = useAppStore((s) => selectionNameId(model, s.selection));
  const hoveredIndex = useHoverStore((s) => s.hover?.source === "city" ? s.hover.idx : -1);
  const [t0, t1] = windowOf(model, brush);
  const city = useMemo(() => cityBuildings(model, hiddenLanes, t0, t1), [model, hiddenLanes, t0, t1]);
  const { buildings, folded, maxSelf } = city;
  const selectedBuilding = cityBuildingForName(city, selectedName);
  const names = useMemo(() => Float32Array.from(buildings.map((b) => b.row.nameId < 0 ? -2 : b.row.nameId)), [buildings]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    buildings.forEach(({ row, rect }, i) => {
      const h = Math.max(scaleHeight(row.self, maxSelf, CITY_H, scale), 0.001);
      writeBox(mesh, i, rect.x + rect.w / 2, h / 2, rect.y + rect.h / 2, rect.w * 0.96, h, rect.h * 0.96);
      mesh.setColorAt(i, CAT_COLORS[row.catId]);
    });
    uploadInstances(mesh, buildings.length, { min: [0, 0, 0], max: [CITY_SIZE, CITY_H, CITY_SIZE] });
  }, [buildings, maxSelf, scale]);
  return <group position={[CITY_X, 0, 0]}>
    <instancedMesh ref={ref} name="city-buildings" args={[undefined, undefined, Math.max(buildings.length, 1)]} count={buildings.length}
      onPointerMove={(event) => {
        const b = event.instanceId === undefined ? null : buildings[event.instanceId];
        if (!b) return;
        event.stopPropagation();
        useHoverStore.getState().setHover({ source: "city", idx: event.instanceId!, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY,
          summary: { title: b.row.nameId < 0 ? `${folded} remaining activities` : model.names[b.row.nameId], catId: b.row.catId,
            detail: `${formatMs(b.row.self)} self · ${formatMs(b.row.total)} inclusive · ${b.row.count.toLocaleString()} calls in this window` } });
      }}
      onPointerOut={() => useHoverStore.getState().setHover(null)}
      onClick={(event) => {
        if (event.instanceId === undefined || event.delta > 4) return;
        event.stopPropagation();
        const b = buildings[event.instanceId];
        if (b.row.nameId >= 0) useAppStore.getState().setSelection({ kind: "name", nameId: b.row.nameId });
        else useAppStore.getState().toggleHud();
      }}
      onDoubleClick={(event) => {
        if (event.instanceId === undefined) return;
        const b = buildings[event.instanceId];
        if (b.row.nameId < 0) return;
        event.stopPropagation();
        useAppStore.getState().setSelection({ kind: "name", nameId: b.row.nameId });
        useAppStore.getState().requestCameraAction("fit-selection");
      }}>
      <boxGeometry><instancedBufferAttribute attach="attributes-traceName" args={[names.length ? names : new Float32Array(1), 1]} /></boxGeometry>
      <DataMaterial names selectedName={selectedBuilding ? selectedBuilding.row.nameId < 0 ? -2 : selectedBuilding.row.nameId : -1} />
    </instancedMesh>
    {buildings.filter((b, i) => b !== selectedBuilding && i !== hoveredIndex && (b.row.nameId < 0 || b.row.self >= maxSelf * 0.08)).slice(0, 12).map(({ row, rect }) => <ScreenLabel key={row.nameId} id={`city-${row.nameId}`} position={[rect.x + rect.w / 2, scaleHeight(row.self, maxSelf, CITY_H, scale) + 1.3, rect.y + rect.h / 2]} priority={30}>
      {row.nameId < 0 ? `+${folded} activities` : model.names[row.nameId]} · {formatMs(row.self)}
    </ScreenLabel>)}
    {buildings.filter((b, i) => i === hoveredIndex || b === selectedBuilding).map(({ row, rect }) => <BoxFeedback key={row.nameId} id={`city-feedback-${row.nameId}`} label={`${row.nameId < 0 ? `+${folded} activities` : model.names[row.nameId]} · ${formatMs(row.self)} self`} bounds={{
      min: [rect.x + rect.w * 0.02, 0, rect.y + rect.h * 0.02],
      max: [rect.x + rect.w * 0.98, Math.max(0.001, scaleHeight(row.self, maxSelf, CITY_H, scale)), rect.y + rect.h * 0.98],
    }} />)}
    <ContactShadows key={`${model.boundsMinUs}-${t0}-${t1}-${scale}-${model.lanes.filter((lane) => !hiddenLanes.has(lane.meta.id)).map((lane) => lane.meta.id).join(",")}`} position={[CITY_SIZE / 2, -0.08, CITY_SIZE / 2]} scale={CITY_SIZE + 8} far={CITY_H + 2} opacity={0.45} blur={2} resolution={256} frames={1} />
    {!buildings.length && <ScreenLabel id="city-empty" position={[CITY_SIZE / 2, 2, CITY_SIZE / 2]} priority={80}>No activity in this window</ScreenLabel>}
  </group>;
}
