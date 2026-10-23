import { useMemo, useState } from "react";
import type { ParsedTraceModel } from "../engine/types";
import { systemMilestones, type SystemMilestone } from "../engine/systemMilestones";
import { formatMs } from "../scene/layout";
import { useAppStore } from "../state/store";

export function SystemScope({ model }: { model: ParsedTraceModel }) {
  const navigationId = useAppStore((state) => state.selectedNavigationId);
  const brush = useAppStore((state) => state.brush);
  const [milestone, setMilestone] = useState<SystemMilestone>("lcp");
  const scope = useMemo(() => systemMilestones(model, navigationId), [model, navigationId]);
  const time = scope.milestones[milestone];
  const label = milestone === "load" ? "Load" : milestone.toUpperCase();
  return <section className="system-scope" aria-label="System investigation window">
    <h1>Who owns this work?</h1>
    <p>Height: thread work on a fixed scale. Blue tiles: owned requests.</p>
    <div className="system-scope-controls">
      {scope.navigations.length > 1 && <label>Page navigation<select value={scope.navigation?.id ?? ""} onChange={(event) => { useAppStore.getState().setSelectedNavigationId(event.target.value); useAppStore.getState().setBrush(null); }}>{scope.navigations.map((nav, index) => <option key={nav.id} value={nav.id}>{index + 1}. {formatMs(nav.start)} · {nav.url}</option>)}</select></label>}
      <label>Milestone<select value={milestone} onChange={(event) => setMilestone(event.target.value as SystemMilestone)}><option value="lcp">Largest content (LCP)</option><option value="fcp">First content (FCP)</option><option value="load">Load event</option></select></label>
      <button className="btn" disabled={!scope.navigation || time === undefined || time <= scope.navigation.start} onClick={() => { if (scope.navigation && time !== undefined) useAppStore.getState().setBrush([scope.navigation.start, time]); }}>Before {label}</button>
      {brush && <button className="btn" onClick={() => useAppStore.getState().setBrush(null)}>Whole recording</button>}
    </div>
    <p className="system-scope-status" role="status">{scope.navigation && time !== undefined ? `${label === "LCP" ? "Latest LCP candidate" : label}: ${formatMs(time - scope.navigation.start)} after navigation. Positions stay fixed when the window changes.` : `${label} is not recorded for this page navigation.`}</p>
    <p className="system-scope-help">Select a request to reveal its evidence routes. Small loops are activity within one thread.</p>
  </section>;
}
