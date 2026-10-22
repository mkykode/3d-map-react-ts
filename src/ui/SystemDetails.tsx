import { useMemo, useState } from "react";
import type { ParsedTraceModel } from "../engine/types";
import { connectionsInWindow } from "../engine/connections";
import { systemLayout } from "../scene/systemLayout";
import { formatMs } from "../scene/layout";
import { threadDefinition } from "../evidence/definitions";
import { useAppStore, windowOf, type Selection } from "../state/store";

export function SystemDetails({ model, selection }: { model: ParsedTraceModel; selection: Extract<Selection, { kind: "lane" | "connection" }> }) {
  const brush = useAppStore((state) => state.brush);
  const hidden = useAppStore((state) => state.hiddenLanes);
  const [t0, t1] = windowOf(model, brush);
  const layout = useMemo(() => systemLayout(model, hidden, t0, t1), [model, hidden, t0, t1]);
  const lane = selection.kind === "lane" ? model.lanes[selection.lane] : null;
  const building = lane ? layout.buildings.find((building) => building.lane === lane.meta.id) : null;
  const edge = selection.kind === "connection" ? model.connections.edges[selection.edge] : null;
  const definition = lane ? threadDefinition(lane.meta) : null;
  return <aside className="panel details system-details" aria-label="Selection details">
    <header><h3>{lane?.meta.name ?? "Connection evidence"}</h3><button className="close" aria-label="Clear selection" onClick={() => useAppStore.getState().setSelection(null)}>×</button></header>
    {lane && <>
      <p>{definition?.text ?? "No reviewed definition"}</p>
      {definition && <a href={definition.source.url} target="_blank" rel="noreferrer">{definition.source.title}</a>}
      <p>{formatMs(building?.busy ?? 0)} busy · {building?.incoming ?? 0} links in · {building?.outgoing ?? 0} links out</p>
      <ol>{building?.activities.slice(0, 3).map((row) => <li key={row.nameId}>{model.names[row.nameId]} · {formatMs(row.self)}</li>)}</ol>
      <button className="btn" onClick={() => useAppStore.getState().openInCanyon(selection)}>Open in Canyon</button>
    </>}
    {edge && selection.kind === "connection" && <>
      <p>{model.lanes[edge.fromLane].meta.name} → {model.lanes[edge.toLane].meta.name}</p>
      <p>{layout.links.counts[selection.edge]} {edge.provenance} links · {edge.kind}</p>
      {edge.kind === "consumer" && <p>URL match: latest request started before the consumer.</p>}
      <ConnectionInstances key={`${selection.edge}:${t0}:${t1}`} model={model} edge={selection.edge} instances={layout.links.instances[selection.edge]} />
    </>}
  </aside>;
}

function ConnectionInstances({ model, edge: edgeId, instances }: { model: ParsedTraceModel; edge: number; instances: number[] }) {
  const [page, setPage] = useState(0);
  const graph = model.connections;
  const edge = graph.edges[edgeId];
  const pageSize = 30;
  return <>
    <ol className="connection-instances" start={page * pageSize + 1}>{instances.slice(page * pageSize, (page + 1) * pageSize).map((instance) => {
      const from = graph.fromIdx[instance], to = graph.toIdx[instance];
      const available = from >= 0 && to >= 0;
      return <li key={instance}><button className="connection-instance" disabled={!available} onClick={() => useAppStore.getState().openInCanyon({ kind: "entry", lane: edge.fromLane, idx: from })}>
        <span>{graph.starts[instance].toFixed(2)} → {graph.ends[instance].toFixed(2)} ms</span>
        <span>{available ? `${model.names[model.lanes[edge.fromLane].nameIds[from]]} → ${model.names[model.lanes[edge.toLane].nameIds[to]]}` : "Endpoint not recorded"}</span>
      </button></li>;
    })}</ol>
    {instances.length > pageSize && <div className="system-controls"><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous links</button><span>{page + 1} / {Math.ceil(instances.length / pageSize)}</span><button className="btn" disabled={(page + 1) * pageSize >= instances.length} onClick={() => setPage(page + 1)}>Next links</button></div>}
  </>;
}

/** Native controls expose every canvas building and arc to keyboard users. */
export function SystemNavigator({ model }: { model: ParsedTraceModel }) {
  const brush = useAppStore((state) => state.brush);
  const hidden = useAppStore((state) => state.hiddenLanes);
  const selection = useAppStore((state) => state.selection);
  const [t0, t1] = windowOf(model, brush);
  const links = useMemo(() => connectionsInWindow(model.connections, t0, t1, hidden), [model, t0, t1, hidden]);
  const total = links.counts.reduce((sum, count) => sum + count, 0);
  return <div className="system-navigator">
    <label>Thread<select aria-label="Select thread" value={selection?.kind === "lane" ? selection.lane : ""} onChange={(event) => { if (event.target.value !== "") useAppStore.getState().setSelection({ kind: "lane", lane: Number(event.target.value) }); }}><option value="">Choose a thread</option>{model.lanes.filter((lane) => lane.meta.kind !== "network" && !hidden.has(lane.meta.id)).map((lane) => <option key={lane.meta.id} value={lane.meta.id}>{lane.meta.name} · {lane.meta.threadId}</option>)}</select></label>
    <label>Connection<select aria-label="Select connection" value={selection?.kind === "connection" ? selection.edge : ""} onChange={(event) => { if (event.target.value !== "") useAppStore.getState().setSelection({ kind: "connection", edge: Number(event.target.value) }); }}><option value="">Choose a connection</option>{model.connections.edges.flatMap((edge, id) => links.counts[id] ? [<option key={id} value={id}>{model.lanes[edge.fromLane].meta.name} → {model.lanes[edge.toLane].meta.name} · {links.counts[id]} {edge.provenance} {edge.kind} links</option>] : [])}</select></label>
    <p>{total ? `${total.toLocaleString()} links in this window` : "No links in this window"}. Solid: recorded. Dashed: derived.</p>
    {model.connections.unplaced > 0 && <p>{model.connections.unplaced} links reach threads not loaded</p>}
  </div>;
}
