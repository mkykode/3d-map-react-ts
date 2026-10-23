import { useMemo, useState } from "react";
import type { ParsedTraceModel } from "../engine/types";
import { requestOwner, type ComponentContext } from "../evidence/systemContext";
import { systemLayout } from "../scene/systemLayout";
import { formatMs } from "../scene/layout";
import { useAppStore, windowOf } from "../state/store";

/** Window summaries deliberately do not subscribe to the playback clock. */
export function SystemOverview({ model }: { model: ParsedTraceModel }) {
  const brush = useAppStore((state) => state.brush);
  const hidden = useAppStore((state) => state.hiddenLanes);
  const selection = useAppStore((state) => state.selection);
  const [section, setSection] = useState<"components" | "requests">("components");
  const [t0, t1] = windowOf(model, brush);
  const layout = useMemo(() => systemLayout(model, hidden, t0, t1), [model, hidden, t0, t1]);
  const components = layout.plates.filter((plate) => plate.lanes.length > 0).map((plate) => {
    const buildings = layout.buildings.filter((building) => plate.lanes.includes(building.lane));
    const busy = buildings.reduce((sum, building) => sum + building.busy, 0);
    const main = buildings.find((building) => model.lanes[building.lane].meta.kind === "main");
    return { ...plate, busy, main, primary: main ?? buildings[0] };
  }).sort((a, b) => b.busy - a.busy || a.id.localeCompare(b.id));
  const maxBusy = components.reduce((max, component) => Math.max(max, component.busy), 1);
  return <section className="system-overview" aria-label="Page components">
    <p className="system-eyebrow">System / selected window</p>
    <h2>Where browser work happens</h2>
    <p className="system-window">{formatMs(t0)} to {formatMs(t1)} · {formatMs(t1 - t0)} window</p>
    <div className="system-summary-switch" role="group" aria-label="System summary">
      <button className="btn" aria-pressed={section === "components"} onClick={() => setSection("components")}>Components</button>
      <button className="btn" aria-pressed={section === "requests"} onClick={() => setSection("requests")}>Network requests</button>
    </div>
    {section === "components" ? <>
    <p className="system-explanation">Thread times can overlap. These are browser work totals, not server response times.</p>
    <div className="system-component-list">
      {components.map((component) => <article className="system-component" key={component.id}>
        <button className="system-component-select" aria-pressed={selection?.kind === "lane" && component.lanes.includes(selection.lane)} onClick={() => useAppStore.getState().setSelection({ kind: "lane", lane: component.primary.lane })}>
          <span><strong>{component.label}</strong><small>{component.context.domain || component.context.relationship || `${component.lanes.length} visible threads`}</small></span>
          <span className="system-metric"><strong>{formatMs(component.busy)}</strong><small>thread work</small></span>
          <span className="system-work-bar" aria-hidden="true"><span style={{ width: `${component.busy / maxBusy * 100}%` }} /></span>
        </button>
        <p>{component.context.description}</p>
        {component.main && <small className="system-work-breakdown">Main {formatMs(component.main.busy)} · Other threads {formatMs(component.busy - component.main.busy)}</small>}
        {component.context.relationship && component.context.relationship !== "Top-level page" && <small>{component.context.relationship}</small>}
      </article>)}
    </div>
    <details className="system-method"><summary>What these numbers mean</summary>
      <p>Thread work sums exclusive event time across visible threads in each process. Nested events are counted once.</p>
      <p>Bars compare those totals. Buildings show each thread separately. Hiding tracks changes both totals and buildings.</p>
      <p>A process can run scripts from several sites. Its total is not the cost of one vendor or proof of a bottleneck.</p>
    </details>
    </> : <SystemRequests key={`${t0}:${t1}`} model={model} t0={t0} t1={t1} />}
  </section>;
}

function SystemRequests({ model, t0, t1 }: { model: ParsedTraceModel; t0: number; t1: number }) {
  const [page, setPage] = useState(0);
  const hidden = useAppStore((state) => state.hiddenLanes);
  const network = model.lanes.find((lane) => lane.meta.kind === "network");
  const requests = useMemo(() => model.requests.flatMap((request, index) => request.start < t1 && request.end > t0 ? [{ request, index, owner: requestOwner(model, request) }] : []), [model, t0, t1]);
  const owners = new Map<string, { context: ComponentContext; count: number }>();
  for (const { request, owner } of requests) {
    const key = `${request.requesterLane}:${owner.title}:${owner.domain}`;
    const group = owners.get(key);
    if (group) group.count++;
    else owners.set(key, { context: owner, count: 1 });
  }
  const pageSize = 20;
  return <section className="system-network" aria-label="Network requests">
    <h3>Network requests <span>{requests.length}</span></h3>
    <p>Each blue tile is one request. Tile size does not show duration or download size.</p>
    {network && hidden.has(network.meta.id) && <p>The network track is hidden on the board.</p>}
    <dl className="system-request-owners">{[...owners].sort((a, b) => b[1].count - a[1].count).map(([key, { context, count }]) => <div key={key}><dt>{context.title}{context.domain && <small>{context.domain}</small>}</dt><dd>{count}</dd></div>)}</dl>
    <details><summary>Inspect requests and ownership</summary>
      <p>Requesters come from frame or process ownership at request start. The download host can be different.</p>
      <ol className="system-request-list" start={page * pageSize + 1}>{requests.slice(page * pageSize, (page + 1) * pageSize).map(({ request, index, owner }) => <li key={index}>
        <button className="connection-instance" disabled={!network} onClick={() => { if (network) useAppStore.getState().setSelection({ kind: "entry", lane: network.meta.id, idx: index }); }}>
          <strong>{owner.title}</strong><span>{request.url || "URL not recorded"}</span><span>{formatMs(request.end - request.start)} request lifetime{request.renderBlocking ? " · Render-blocking" : ""}</span>
        </button>
      </li>)}</ol>
      {requests.length > pageSize && <div className="system-controls"><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous requests</button><span>{page + 1} / {Math.ceil(requests.length / pageSize)}</span><button className="btn" disabled={(page + 1) * pageSize >= requests.length} onClick={() => setPage(page + 1)}>Next requests</button></div>}
    </details>
  </section>;
}
