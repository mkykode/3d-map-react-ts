import { describe, expect, it } from "vitest";
import { sceneLane, sceneModel } from "../test/sceneFixtures";
import { cityBuildings, cityNeighbors } from "./cityLayout";

describe("City entity districts", () => {
  it("keeps activity identity across entities and ranks stack callers by clipped inclusive time", () => {
    const lane = sceneLane([{ start: 0, dur: 20, name: 0 }, { start: 1, dur: 8, name: 1 }, { start: 10, dur: 5, name: 1 }]);
    lane.entityIds.set([1, 2, 0]);
    lane.parentIndexes.set([-1, 0, 0]);
    const model = sceneModel([lane]);
    model.entityNames = ["First party", "Third party"];
    const city = cityBuildings(model, new Set(), 0, 12);
    expect(city.districts.map((district) => district.label)).toEqual(["Unattributed", "First party", "Third party"]);
    expect(city.buildings.filter((building) => building.row.nameId === 1)).toHaveLength(2);
    expect(cityNeighbors(city, new Set(["1:0"]))).toEqual([
      { from: "1:0", to: "2:1", total: 8 }, { from: "1:0", to: "0:1", total: 2 },
    ]);
  });
});
