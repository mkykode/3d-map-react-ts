import { describe, expect, it } from "vitest";
import { sceneModel } from "../test/sceneFixtures";
import { systemMilestones } from "./systemMilestones";

describe("System page milestone scope", () => {
  it("uses the selected page navigation, accepts its final marker, and excludes other frames", () => {
    const model = sceneModel([], 100);
    model.mainFrameId = "page";
    model.defaultNavigationId = "a";
    model.navigations = [
      { id: "a", kind: "hard", frameId: "page", processId: 1, emittingThreadId: 1, start: 0, end: 50, url: "https://page.test" },
      { id: "b", kind: "hard", frameId: "page", processId: 1, emittingThreadId: 1, start: 50, end: 100, url: "https://page.test/next" },
    ];
    model.markers = [
      { name: "largestContentfulPaint::Candidate", label: "LCP", ts: 20, frameId: "page", navigationId: "a" },
      { name: "largestContentfulPaint::Candidate", label: "LCP", ts: 40, frameId: "widget" },
      { name: "largestContentfulPaint::Candidate", label: "LCP", ts: 50, frameId: "page" },
      { name: "largestContentfulPaint::Candidate", label: "LCP", ts: 100, frameId: "page", navigationId: "b" },
    ];
    expect(systemMilestones(model, "a").milestones).toEqual({ lcp: 20 });
    expect(systemMilestones(model, "b").milestones).toEqual({ lcp: 100 });
    expect(systemMilestones(model, "missing").navigation?.id).toBe("a");
    model.markers = [];
    expect(systemMilestones(model, "a").milestones).toEqual({});
    model.navigations = [];
    expect(systemMilestones(model, null).navigation).toBeNull();
  });
});
