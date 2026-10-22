import { useEffect, useMemo } from "react";
import type { ParsedTraceModel } from "../engine/types";
import { adjacentMoment, playbackPackets, narrate, playbackIndex, playbackStatus, traceMoments } from "../engine/moments";
import { connectionsInWindow } from "../engine/connections";
import { useReducedMotion } from "../lib/useReducedMotion";
import { isEditableKeyboardTarget } from "../scene/cameraActions";
import { useAppStore, windowOf } from "../state/store";
import { SystemNavigator } from "./SystemDetails";

export function NarrationPanel({ model }: { model: ParsedTraceModel }) {
  const brush = useAppStore((state) => state.brush);
  const hidden = useAppStore((state) => state.hiddenLanes);
  const playhead = useAppStore((state) => state.playhead);
  const playing = useAppStore((state) => state.playing);
  const rate = useAppStore((state) => state.playbackRate);
  const findings = useAppStore((state) => state.analysisFindings);
  const reduced = useReducedMotion();
  const [t0, t1] = windowOf(model, brush);
  const moments = useMemo(() => traceMoments(model, [t0, t1], findings), [model, t0, t1, findings]);
  const index = useMemo(() => playbackIndex(model), [model]);
  const visibleEdges = useMemo(() => new Set(Array.from(connectionsInWindow(model.connections, t0, t1, hidden).counts).flatMap((count, id) => count ? [id] : [])), [model, t0, t1, hidden]);
  const visibleRequesters = useMemo(() => new Set(model.lanes.some((lane) => lane.meta.kind === "network" && !hidden.has(lane.meta.id)) ? model.lanes.filter((lane) => !hidden.has(lane.meta.id)).map((lane) => lane.meta.id) : []), [model, hidden]);
  const omitted = playhead === null ? 0 : playbackPackets(index, playhead, visibleEdges, visibleRequesters).omitted;
  const current = playbackStatus(model, index, playhead ?? t0, hidden);
  const previous = adjacentMoment(moments, playhead, -1), next = adjacentMoment(moments, playhead, 1);
  const step = (direction: -1 | 1) => {
    const state = useAppStore.getState();
    const moment = adjacentMoment(moments, state.playhead, direction);
    if (moment) { state.setPlaying(false); state.setPlayhead(moment.time); }
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditableKeyboardTarget(event.target as HTMLElement)) return;
      const direction = event.code === "Comma" ? -1 : event.code === "Period" ? 1 : null;
      if (!direction) return;
      const state = useAppStore.getState();
      const moment = adjacentMoment(moments, state.playhead, direction);
      event.preventDefault();
      if (moment) { state.setPlaying(false); state.setPlayhead(moment.time); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [moments]);
  useEffect(() => {
    if (!playing) return;
    if (reduced) {
      const timer = window.setInterval(() => {
        const state = useAppStore.getState();
        const next = adjacentMoment(moments, state.playhead, 1);
        if (next) state.setPlayhead(next.time);
        else { state.setPlayhead(t1); state.setPlaying(false); }
      }, 1000);
      return () => window.clearInterval(timer);
    }
    let last: number | null = null;
    let frame = 0;
    const advance = (now: number) => {
      const state = useAppStore.getState();
      if (!state.playing) return;
      const time = Math.min(t1, (state.playhead ?? t0) + (last === null ? 0 : now - last) * rate);
      last = now;
      state.setPlayhead(time);
      if (time >= t1) state.setPlaying(false);
      else frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [playing, rate, reduced, moments, t0, t1]);
  return <section className="panel narration" aria-label="System playback">
    <header><h2>Connected system</h2><span className="system-time">{playhead === null ? "Overview" : `${playhead.toFixed(2)} ms`}</span></header>
    <p className="system-narration">{playhead === null ? "Buildings show busy time. Arcs show links between threads. Select a building or connection to inspect its evidence." : narrate(model, current)}</p>
    <div className="system-controls">
      <button className="btn" onClick={() => useAppStore.getState().setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
      <button className="btn" aria-keyshortcuts="," disabled={!previous} onClick={() => step(-1)}>Previous moment</button>
      <button className="btn" aria-keyshortcuts="." disabled={!next} onClick={() => step(1)}>Next moment</button>
      <label>Speed<select aria-label="Playback speed" value={rate} onChange={(event) => useAppStore.getState().setPlaybackRate(Number(event.target.value) as 0.1 | 0.25 | 1)}>{[0.1, 0.25, 1].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
    </div>
    <label className="playhead-control">Playhead<input aria-label="Playhead" type="range" min={t0} max={t1} step="0.01" value={playhead ?? t0} onChange={(event) => { useAppStore.getState().setPlaying(false); useAppStore.getState().setPlayhead(Number(event.target.value)); }} /></label>
    <p className="system-status" aria-label="Playback status">{current.time.toFixed(2)} ms · {current.active.length} busy threads · {current.requests.length} requests in flight · {current.phase}</p>
    {omitted > 0 && <p>{omitted} packets are not drawn (512 shown).</p>}
    <details><summary>Threads and connections</summary>
      <SystemNavigator model={model} />
      {reduced && <p>Reduced motion: Play steps between moments. Packets stay still.</p>}
      <p>Request markers show lifetimes, not initiator links.</p>
    </details>
  </section>;
}
