import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ContactShadows } from "@react-three/drei";
import type { ParsedTraceModel } from "../engine/types";
import { useAppStore, useHoverStore, windowOf } from "../state/store";
import { CAT_COLORS, CITY_H, scaleHeight, formatMs } from "./layout";
import { cityBuildingForName, cityBuildings, cityNeighbors } from "./cityLayout";
import { ConnectionArcs } from "./ConnectionArcs";
import type { ConnectionArc } from "./connectionGeometry";
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
  const { buildings, maxSelf } = city;
  const selectedBuilding = cityBuildingForName(city, selectedName);
  const names = useMemo(() => Float32Array.from(buildings.map((b) => b.row.nameId)), [buildings]);
  const arcs = useMemo<ConnectionArc[]>(() => {
    const hovered = buildings[hoveredIndex];
    const keys = new Set(hovered ? [hovered.key] : buildings.filter((building) => building.row.nameId === selectedName).map((building) => building.key));
    const point = (key: string): [number, number, number] | null => {
      const building = buildings.find((building) => building.key === key);
      return building ? [building.rect.x + building.rect.w / 2, Math.max(0.001, scaleHeight(building.row.self, maxSelf, CITY_H, scale)), building.rect.y + building.rect.h / 2] : null;
    };
    return cityNeighbors(city, keys).flatMap((relation, id) => {
      const from = point(relation.from), to = point(relation.to);
      return from && to ? [{ id, from, to, count: 1, provenance: "derived" as const }] : [];
    });
  }, [city, buildings, hoveredIndex, selectedName, maxSelf, scale]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const plates = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!plates.current) return;
    city.districts.forEach(({ rect }, i) => writeBox(plates.current!, i, rect.x + rect.w / 2, -0.2, rect.y + rect.h / 2, rect.w * 0.99, 0.3, rect.h * 0.99));
    uploadInstances(plates.current, city.districts.length, { min: [0, -0.35, 0], max: [CITY_SIZE, 0, CITY_SIZE] });
  }, [city]);
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
    <instancedMesh ref={plates} name="city-districts" args={[undefined, undefined, Math.max(1, city.districts.length)]} count={city.districts.length} raycast={() => {}}><boxGeometry /><meshBasicMaterial color="#353b44" fog={false} toneMapped={false} /></instancedMesh>
    {city.districts.map((district) => <ScreenLabel key={district.entity} id={`city-district-${district.entity}`} position={[district.rect.x + district.rect.w / 2, 0.5, district.rect.y]} priority={80} kind="district">{district.label}</ScreenLabel>)}
    <ConnectionArcs arcs={arcs} />
    <instancedMesh ref={ref} name="city-buildings" args={[undefined, undefined, Math.max(buildings.length, 1)]} count={buildings.length}
      onPointerMove={(event) => {
        const b = event.instanceId === undefined ? null : buildings[event.instanceId];
        if (!b) return;
        event.stopPropagation();
        useHoverStore.getState().setHover({ source: "city", idx: event.instanceId!, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY,
          summary: { title: model.names[b.row.nameId], catId: b.row.catId,
            detail: `${b.entity === 0 ? "Unattributed" : model.entityNames[b.entity - 1]} · ${formatMs(b.row.self)} self · ${formatMs(b.row.total)} inclusive · ${b.row.count.toLocaleString()} calls in this window. Dashed arcs: top 8 stack callers and callees by inclusive time.` } });
      }}
      onPointerOut={() => useHoverStore.getState().setHover(null)}
      onClick={(event) => {
        if (event.instanceId === undefined || event.delta > 4) return;
        event.stopPropagation();
        const b = buildings[event.instanceId];
        useAppStore.getState().setSelection({ kind: "name", nameId: b.row.nameId });
      }}
      onDoubleClick={(event) => {
        if (event.instanceId === undefined) return;
        const b = buildings[event.instanceId];
        event.stopPropagation();
        useAppStore.getState().setSelection({ kind: "name", nameId: b.row.nameId });
        useAppStore.getState().requestCameraAction("fit-selection");
      }}>
      <boxGeometry><instancedBufferAttribute attach="attributes-traceName" args={[names.length ? names : new Float32Array(1), 1]} /></boxGeometry>
      <DataMaterial names selectedName={selectedName ?? -1} />
    </instancedMesh>
    {buildings.filter((b, i) => b !== selectedBuilding && i !== hoveredIndex && b.row.self >= maxSelf * 0.08).slice(0, 12).map(({ row, rect, key }) => <ScreenLabel key={key} id={`city-${key}`} position={[rect.x + rect.w / 2, scaleHeight(row.self, maxSelf, CITY_H, scale) + 1.3, rect.y + rect.h / 2]} priority={30}>
      {model.names[row.nameId]} · {formatMs(row.self)}
    </ScreenLabel>)}
    {buildings.filter((b, i) => i === hoveredIndex || b === selectedBuilding).map(({ row, rect, key }) => <BoxFeedback key={key} id={`city-feedback-${key}`} label={`${model.names[row.nameId]} · ${formatMs(row.self)} self`} bounds={{
      min: [rect.x + rect.w * 0.02, 0, rect.y + rect.h * 0.02],
      max: [rect.x + rect.w * 0.98, Math.max(0.001, scaleHeight(row.self, maxSelf, CITY_H, scale)), rect.y + rect.h * 0.98],
    }} />)}
    <ContactShadows key={`${model.boundsMinUs}-${t0}-${t1}-${scale}-${model.lanes.filter((lane) => !hiddenLanes.has(lane.meta.id)).map((lane) => lane.meta.id).join(",")}`} position={[CITY_SIZE / 2, -0.08, CITY_SIZE / 2]} scale={CITY_SIZE + 8} far={CITY_H + 2} opacity={0.45} blur={2} resolution={256} frames={1} />
    {!buildings.length && <ScreenLabel id="city-empty" position={[CITY_SIZE / 2, 2, CITY_SIZE / 2]} priority={80}>No activity in this window</ScreenLabel>}
  </group>;
}
