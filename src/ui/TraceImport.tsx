import { useEffect, useRef, useState } from "react";
import { fitsFullRecording } from "../engine/ingest/budget";
import type { TraceOverview } from "../engine/ingest/types";
import { readTraceReduction } from "../engine/ingest/reduction";
import { suggestTraceWindow } from "../engine/ingest/suggestWindow";
import { useAppStore } from "../state/store";
import type { TraceImportState } from "../state/traceImport";

export function TraceImport() {
  const pending = useAppStore((state) => state.traceImport);
  const primary = useAppStore((state) => state.primarySession);
  const secondary = useAppStore((state) => state.secondarySession);
  const last = useAppStore((state) => state.lastTraceImport);
  const cancel = useAppStore((state) => state.cancelTraceImport);
  const reopen = useAppStore((state) => state.reopenTraceImport);
  const dialog = useRef<HTMLDialogElement>(null);
  const visible = !!pending && (pending.phase === "scanning" || pending.overview !== null);
  useEffect(() => {
    if (!visible) return;
    const previousFocus = document.activeElement;
    const panel = dialog.current;
    panel?.showModal();
    return () => {
      panel?.close();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [visible]);
  const reports = [primary, secondary].flatMap((session, index) => {
    const report = readTraceReduction(session?.metadata?.traceTopographyReduction);
    return report ? [{ label: index === 0 ? "Primary" : "Comparison", report }] : [];
  });
  return <>
    {reports.length > 0 && <aside className="trace-reduction" aria-label="Import scope">
      <details><summary>Reduced visualization {reports.some(({ report }) => report.window) ? "· selected interval" : "· full recording"}</summary>
        {reports.map(({ label, report }) => <p key={label}>{label}: {report.retainedEventCount.toLocaleString()} events retained from {report.sourceEventCount.toLocaleString()}. V8 call and debugger bookkeeping omitted: {report.droppedBookkeeping.toLocaleString()}; embedded source events omitted: {report.droppedSourceEvents.toLocaleString()}{report.droppedMalformed > 0 && `; malformed events skipped: ${report.droppedMalformed.toLocaleString()}`}. {report.window && "Window boundaries can truncate network requests, async relationships and page-wide metrics. The timeline starts at the selected interval."} {report.omittedEnvelopeFields.length > 0 && `Envelope fields omitted: ${report.omittedEnvelopeFields.join(", ")}.`}</p>)}
        <p>Omitted v8.callFunction wrappers were stack levels in the exact model, so calls nested inside them sit one level shallower and their parents show more self time than an exact import. Memory counters are not thinned. Keep the original recording for complete evidence and controlled experiments.</p>
      </details>
      {last && <button type="button" className="btn small" onClick={reopen}>Change interval</button>}
    </aside>}
    {pending && !visible && <button className="btn trace-cancel" type="button" onClick={cancel}>Cancel trace import</button>}
    <dialog ref={dialog} className="trace-import-panel" aria-labelledby="trace-import-title" onCancel={(event) => { event.preventDefault(); cancel(); }}>
      {visible && pending && <>
        <header className="trace-import-header"><div><p className="experiment-kicker">Local file · {pending.slot === "primary" ? "Primary trace" : "Comparison"}</p><h1 id="trace-import-title">{pending.phase === "choosing" ? "Choose what to load" : pending.phase === "scanning" ? "Scanning recording" : "Loading interval"}</h1></div>
          <button type="button" className="btn" onClick={cancel}>Cancel trace import</button></header>
        <p className="trace-import-filename">{pending.file.name} <span>{formatBytes(pending.file.size)}</span></p>
        {pending.phase !== "choosing" ? <ImportProgress pending={pending} /> : pending.overview && <WindowPicker key={`${pending.file.name}:${pending.file.lastModified}`} overview={pending.overview} initialWindow={pending.selectedWindow} />}
        {pending.error && <p role="alert" className="trace-import-error">{pending.error}</p>}
        <p className="trace-import-footnote">Processed on this device. No trace data is uploaded. The original file is unchanged.</p>
      </>}
    </dialog>
  </>;
}

function ImportProgress({ pending }: { pending: TraceImportState }) {
  const progress = pending.progress;
  const reading = !progress || progress.stage === "scanning" || progress.stage === "ingesting";
  const percent = progress && progress.total > 0 ? Math.min(100, Math.round(progress.completed / progress.total * 100)) : 0;
  return <div className="trace-import-progress">
    <p role="status">{reading ? `${pending.phase === "scanning" ? "Building activity overview" : "Reading and filtering events"} · ${percent}%` : "Building the 3D model. This can take a few seconds."}</p>
    <progress aria-label="Trace import progress" max={100} value={reading ? percent : undefined} />
    <p>{pending.phase === "scanning" ? "Scanning the whole file without keeping its events in memory. You can choose the full recording or a smaller interval next." : "Only retained events enter the trace engine. Cancellation may wait for the current engine stage to finish."}</p>
  </div>;
}

function WindowPicker({ overview, initialWindow }: { overview: TraceOverview; initialWindow?: readonly [number, number] }) {
  const duration = (overview.endUs - overview.startUs) / 1e6;
  const fullFits = fitsFullRecording(overview.retainedBytes, overview.retainedEventCount);
  const [suggested] = useState(() => initialWindow ?? suggestTraceWindow(overview));
  const [start, setStart] = useState((suggested[0] - overview.startUs) / 1e6);
  const [end, setEnd] = useState((suggested[1] - overview.startUs) / 1e6);
  const confirm = useAppStore((state) => state.confirmTraceImport);
  const valid = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= duration;
  const max = Math.max(1, ...overview.counts);
  const x = (us: number) => (us - overview.startUs) / (overview.endUs - overview.startUs) * 1000;
  return <div className="trace-window-picker">
    <p><strong>{duration.toFixed(2)} seconds</strong> · {overview.eventCount.toLocaleString()} source events · approximately {formatBytes(overview.retainedBytes)} after filtering</p>
    <svg className="trace-activity" viewBox="0 0 1000 120" role="img" aria-label="Retained event density across the recording, not CPU utilization">
      <title>Retained event count per time bucket. Selection shown in blue.</title>
      <defs><clipPath id="trace-activity-clip"><rect width="1000" height="120" /></clipPath></defs>
      <g clipPath="url(#trace-activity-clip)">
        {overview.counts.map((count, index) => {
          const left = x(overview.bucketStartUs + index * overview.bucketWidthUs);
          const height = Math.sqrt(count / max) * 108;
          return <rect key={index} x={left} y={120 - height} width={Math.max(1, overview.bucketWidthUs / (overview.endUs - overview.startUs) * 1000)} height={height} fill="currentColor" />;
        })}
        {valid && <rect x={start / duration * 1000} y="1" width={(end - start) / duration * 1000} height="118" className="trace-activity-selection" />}
      </g>
    </svg>
    <div className="trace-window-fields">
      <label>Start (seconds)<input type="number" min={0} max={duration} step="any" value={Number.isNaN(start) ? "" : start} onChange={(event) => setStart(event.target.valueAsNumber)} /></label>
      <label>End (seconds)<input type="number" min={0} max={duration} step="any" value={Number.isNaN(end) ? "" : end} onChange={(event) => setEnd(event.target.valueAsNumber)} /></label>
    </div>
    <label className="trace-window-slider">Move interval<input type="range" min={0} max={valid ? Math.max(0, duration - (end - start)) : 0} step={0.01} value={valid ? start : 0} disabled={!valid || end - start >= duration} onChange={(event) => { const next = event.target.valueAsNumber; setEnd(Math.min(duration, next + end - start)); setStart(next); }} /></label>
    <p className="trace-import-note">V8 call wrappers, debugger bookkeeping and embedded sources are omitted, so nesting depth and parent self time differ from an exact import. CPU sample timing is preserved; memory counters inside the interval are not thinned. Window boundaries can truncate network and async events. This is not a complete page-load measurement.</p>
    {!valid && <p role="status">Enter a start and end within the recording, with end after start.</p>}
    <div className="trace-import-actions">
      <button className="btn active" type="button" disabled={!valid} onClick={() => void confirm([overview.startUs + start * 1e6, overview.startUs + end * 1e6])}>Load selected interval</button>
      <button className="btn" type="button" disabled={!fullFits} onClick={() => void confirm(null)}>Load full recording</button>
    </div>
    {!fullFits && <p>The full recording exceeds the retained-data budget. The suggested interval targets activity and leaves memory headroom. Dense intervals may need a shorter window.</p>}
  </div>;
}

function formatBytes(bytes: number): string { return `${(bytes / 1024 ** 2).toFixed(1)} MiB`; }
