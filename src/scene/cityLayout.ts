import { exclusiveTimeInWindow, windowSlice } from "../engine/aggregate";
import type { BottomUpRow, ParsedTraceModel } from "../engine/types";
import { squarify } from "../lib/treemap";
import { CITY_SIZE } from "./sceneBounds";

export function cityBuildings(model: ParsedTraceModel, hidden: Set<number>, t0: number, t1: number) {
  const groups = new Map<number, Map<number, BottomUpRow>>();
  const relations = new Map<string, { from: string; to: string; total: number }>();
  for (const lane of model.lanes) {
    if (hidden.has(lane.meta.id)) continue;
    const { lo, hi } = windowSlice(lane, t0, t1);
    for (let i = lo; i < hi; i++) {
      const total = Math.max(0, Math.min(t1, lane.starts[i] + lane.durs[i]) - Math.max(t0, lane.starts[i]));
      if (total <= 0) continue;
      const entity = lane.entityIds[i];
      const rows = groups.get(entity) ?? new Map<number, BottomUpRow>();
      const nameId = lane.nameIds[i];
      const row = rows.get(nameId) ?? { nameId, catId: lane.catIds[i], self: 0, total: 0, count: 0 };
      row.self += exclusiveTimeInWindow(lane, i, t0, t1); row.total += total; row.count++;
      rows.set(nameId, row); groups.set(entity, rows);
      const parent = lane.parentIndexes[i];
      if (parent < 0) continue;
      const from = `${lane.entityIds[parent]}:${lane.nameIds[parent]}`, to = `${entity}:${nameId}`;
      if (from === to) continue;
      const key = `${from}>${to}`;
      const relation = relations.get(key) ?? { from, to, total: 0 };
      relation.total += total; relations.set(key, relation);
    }
  }
  const groupsSorted = [...groups].sort(([a], [b]) => a - b);
  const districtRects = squarify(groupsSorted.map(([, rows]) => [...rows.values()].reduce((sum, row) => sum + row.total, 0)), CITY_SIZE, CITY_SIZE);
  const districts = groupsSorted.map(([entity, rows], index) => ({ entity, label: entity === 0 ? "Unattributed" : model.entityNames[entity - 1], rect: districtRects[index], rows }));
  const buildings = districts.flatMap((district) => {
    const rows = [...district.rows.values()].sort((a, b) => b.total - a.total || a.nameId - b.nameId);
    const inset = Math.min(1, district.rect.w / 8, district.rect.h / 8);
    const rects = squarify(rows.map((row) => row.total), district.rect.w - inset * 2, district.rect.h - inset * 2);
    return rows.map((row, i) => ({ row, entity: district.entity, key: `${district.entity}:${row.nameId}`, rect: { ...rects[i], x: district.rect.x + inset + rects[i].x, y: district.rect.y + inset + rects[i].y } }));
  });
  return { buildings, districts, relations: [...relations.values()], maxSelf: buildings.reduce((max, building) => Math.max(max, building.row.self), 1e-6) };
}

export function cityBuildingForName(city: ReturnType<typeof cityBuildings>, nameId: number | null) {
  return nameId === null ? null : city.buildings.find((b) => b.row.nameId === nameId) ?? null;
}

export function cityNeighbors(city: ReturnType<typeof cityBuildings>, keys: ReadonlySet<string>) {
  const ranked = [...city.relations].sort((a, b) => b.total - a.total || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const callers = ranked.filter((edge) => keys.has(edge.to)).slice(0, 8);
  const callees = ranked.filter((edge) => keys.has(edge.from)).slice(0, 8);
  return [...new Set([...callers, ...callees])];
}
