import { describe, expect, it } from "vitest";
import { sceneLane, sceneModel } from "../test/sceneFixtures";
import { activeIntervals, adjacentMoment, intervalIndex, narrate, playbackIndex, playbackPackets, playbackStatus, traceMoments } from "./moments";

describe("playback observations", () => {
  it("caps request activity at 512 markers and discloses the remainder (AC-2.8)", () => {
    const model = sceneModel([sceneLane([])]);
    model.requests = Array.from({ length: 513 }, (_, i) => ({ start: i / 1000, end: 100, url: `https://example.test/${i}`, renderBlocking: false, initiatorType: null, requesterLane: 0 }));
    const index = playbackIndex(model);
    const frame = playbackPackets(index, 50, new Set(), new Set([0]));
    expect(frame.packets).toHaveLength(512);
    expect(frame.omitted).toBe(1);
    expect(playbackPackets(index, 50, new Set(), new Set()).packets).toHaveLength(0);
    expect(playbackPackets(index, 50, new Set(), new Set([0]))).toEqual(frame);
  });
  it("steps between recorded milestones and long tasks, without stepping past the last (AC-2.3)", () => {
    const model = sceneModel([sceneLane([{ start: 0, dur: 49 }, { start: 50, dur: 50 }, { start: 100, dur: 90 }])], 200);
    model.markers = [{ name: "navigationStart", label: "Nav", ts: 1 }, { name: "firstContentfulPaint", label: "FCP", ts: 40 }, { name: "largestContentfulPaint::Candidate", label: "LCP", ts: 70 }];
    const moments = traceMoments(model, [0, 200]);
    expect(moments.map((moment) => moment.time)).toEqual([1, 40, 50, 70, 100]);
    expect(adjacentMoment(moments, null, 1)?.time).toBe(1);
    expect(adjacentMoment(moments, 50, -1)?.time).toBe(40);
    expect(adjacentMoment(moments, 100, 1)).toBeNull();
    expect(traceMoments(model, [51, 80]).map((moment) => moment.time)).toEqual([70]);
  });

  it("uses half-open activity intervals, including nested intervals, and observational narration (AC-2.4)", () => {
    const intervals = intervalIndex([{ start: 0, end: 100 }, { start: 10, end: 15 }, { start: 20, end: 25 }]);
    expect(activeIntervals(intervals, 16)).toEqual([{ start: 0, end: 100 }]);
    expect(activeIntervals(intervals, 100)).toEqual([]);
    const model = sceneModel([sceneLane([{ start: 0, dur: 100 }])], 100);
    const status = playbackStatus(model, playbackIndex(model), 50, new Set());
    expect(status.active).toHaveLength(1);
    expect(narrate(model, status)).toContain("100.0 ms");
    expect(narrate(model, status)).not.toMatch(/because|caused|due to/i);
    expect(playbackStatus(model, playbackIndex(model), 50, new Set([0])).active).toHaveLength(0);
  });
});
