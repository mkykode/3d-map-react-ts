import type { ParsedTraceModel } from "./types";

export type SystemMilestone = "fcp" | "lcp" | "load";
const NAMES: Record<SystemMilestone, string> = { fcp: "firstContentfulPaint", lcp: "largestContentfulPaint::Candidate", load: "MarkLoad" };

/** Milestones belong to a hard navigation on the main frame, never a nearby iframe. */
export function systemMilestones(model: ParsedTraceModel, navigationId: string | null) {
  const navigations = model.navigations.filter((nav) => nav.kind === "hard" && nav.frameId === model.mainFrameId).sort((a, b) => a.start - b.start);
  const navigation = navigations.find((nav) => nav.id === navigationId) ?? navigations.find((nav) => nav.id === model.defaultNavigationId) ?? navigations[0] ?? null;
  const milestones: Partial<Record<SystemMilestone, number>> = {};
  if (navigation) {
    const next = navigations.find((nav) => nav.start > navigation.start)?.start ?? Infinity;
    const end = Math.min(model.rangeMs, navigation.end, next);
    const markers = model.markers.filter((marker) => marker.frameId === navigation.frameId && marker.ts >= navigation.start && marker.ts <= end && marker.ts < next && (!marker.navigationId || marker.navigationId === navigation.id)).sort((a, b) => a.ts - b.ts);
    for (const key of Object.keys(NAMES) as SystemMilestone[]) {
      const matches = markers.filter((marker) => marker.name === NAMES[key]);
      const marker = key === "lcp" ? matches[matches.length - 1] : matches[0];
      if (marker) milestones[key] = marker.ts;
    }
  }
  return { navigations, navigation, milestones };
}
