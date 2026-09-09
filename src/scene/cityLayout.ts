import { bottomUp } from "../engine/aggregate";
import { CAT_ID } from "../engine/categories";
import type { BottomUpRow, ParsedTraceModel } from "../engine/types";
import { squarify } from "../lib/treemap";
import { CITY_SIZE } from "./sceneBounds";

export function cityBuildings(model: ParsedTraceModel, hidden: Set<number>, t0: number, t1: number) {
  const rows = bottomUp(model.lanes.filter((l) => !hidden.has(l.meta.id)), t0, t1).filter((r) => r.total > 0);
  const kept = rows.slice(0, 59);
  const rest = rows.slice(59);
  if (rest.length) kept.push(rest.reduce<BottomUpRow>((sum, row) => ({ ...sum, self: sum.self + row.self, total: sum.total + row.total, count: sum.count + row.count }), { nameId: -1, catId: CAT_ID.system, self: 0, total: 0, count: 0 }));
  kept.sort((a, b) => b.total - a.total || a.nameId - b.nameId);
  const rects = squarify(kept.map((r) => r.total), CITY_SIZE, CITY_SIZE);
  return { buildings: kept.map((row, i) => ({ row, rect: rects[i] })), folded: rest.length, foldedNames: new Set(rest.map((r) => r.nameId)), maxSelf: Math.max(1e-6, ...kept.map((r) => r.self)) };
}

export function cityBuildingForName(city: ReturnType<typeof cityBuildings>, nameId: number | null) {
  return nameId === null ? null : city.buildings.find((b) => b.row.nameId === (city.foldedNames.has(nameId) ? -1 : nameId)) ?? null;
}
