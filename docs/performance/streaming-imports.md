# Streaming visualization imports

## What changed

Large local files no longer pass through the whole-buffer, whole-string import
path. Files above 32 MiB, and gzip files detected by magic bytes, first produce a
bounded activity overview. The user chooses the whole recording or a time window.
The next pass retains only visualization events before invoking the same DevTools
engine. Small uncompressed imports and controlled experiments retain the existing
exact-envelope path.

Both passes run inside the existing serialized worker job queue. Cancellation is
checked between chunks, and the loop yields at least once per approximately 50 ms
of processing. Engine canonicalization still has synchronous stages: cancellation
prevents publication but does not interrupt a synchronous JavaScript function.

## Fidelity contract

This is an explicit reduced visualization, not a lossless trace conversion:

- Drop `v8.callFunction`, `v8::Debugger::*`, events exclusively categorized as
  `disabled-by-default-v8.inspector`, and embedded V8 source-rundown categories.
  This changes the rendered flame chart, not only its size: the engine treats
  every `X` event as a stack entry, so a `v8.callFunction` wrapper is a level in
  the exact model. Calls nested inside one sit one level shallower after the
  reduction, and the wrapper's parent gains the wrapper's self time. DevTools
  hides these wrappers in its own flame chart. The notice states this.
- Skip array members that are not well-formed trace events (missing name, ph,
  ts, pid or tid, negative dur) and count them as malformed instead of failing
  the whole import; the exact path tolerated them too.
- Retain all memory-counter events within the selected interval. No 100 ms
  thinning, which could hide short peaks.
- Preserve CPU profile headers and node definitions. Rebuild sample deltas from
  the original cumulative clock, including negative deltas supported by Chromium.
  Filter line/column arrays with the samples. `trace_ids` maps trace ids to
  node ids and passes through unchanged because every node is kept.
- Anchor the overview and window seconds on `TracingStartedInBrowser` when the
  trace has one. Recordings carry stray compositor events from seconds before
  tracing started, and the engine's bounds ignore them.
- Clip complete spans and reconstruct synchronous begin/end spans before
  clipping. Keep process/thread and renderer-frame context.
- Omit resources, source maps and other unused envelope fields; preserve metadata
  and settings. List omitted field names in the reduction report.
- Window boundaries can truncate asynchronous chains, network requests, frames,
  and page-wide metrics. They are not complete page-load measurements.

SHA-256 identifies the exact original compressed input and decompressed payload.
It runs in JavaScript over every byte of the load pass (twice for gzip), which
is a few seconds per gigabyte; the scan pass skips it.
The reduction report records the window and counts separately. Controlled
experiments reject sessions carrying this reduction marker, including prepared
files imported through the exact-envelope path.

## Memory policy

The 1.5 GiB aggregate projected budget remains unchanged. Streaming replaces the
whole-file multipliers with a retained-data projection:

`64 MiB + max(retained JSON bytes × 15, retained events × 2048)`

The factor 15 retains the existing calibration's 4.5× raw objects, 7.5× engine and
3× canonical overlap. Whole-file byte buffers and string decoding no longer apply.
Additional guards cap retained JSON at 80 MiB, retained events at 400,000, each
event or metadata value at 16 MiB, nesting at 128, input at 8 GiB, decompressed
work at 16 GiB, and total streamed events at 50 million. The overview has at most
2048 bins, coarsening its initial 100 ms buckets for long recordings.

These bounds are conservative admission estimates, not measured browser heap
ceilings. CPU profile dictionaries can still exceed the retained budget even with
a short interval. Such inputs fail safely and need a smaller recording; the app
does not silently remove definitions or evict existing sessions.

## Verification evidence

- Reproduced the original 122,087,071-byte file rejection in the local browser.
- The streaming full import retains 195,904 of 590,676 events, approximately
  70,012,012 bytes of JSON, and successfully renders in the browser.
- The supplied 1,208,372,079-byte recording contains 4,360,446 events. Its scan
  retains only an overview; the approximately 875 MB full retained set is rejected
  in favor of a selected window.
- On the local production build, the 122 MB comparison took approximately 3.9 s
  to scan and 9.2 s to load after confirmation. A busy 250 ms interval from the
  1.2 GB recording retained 80,481 events and rendered 78,603; the scan took
  approximately 32.6 s and the subsequent streaming/load pass 57.0 s, including an
  814 ms engine stage. These are individual local observations, not portable
  performance guarantees. A one-second interval at that location exceeded the
  80 MiB retained budget; there is no universal 10-second safe window.
- The picker suggests an activity-bearing interval and reduces its duration
  using event density and average retained bytes, with 35% headroom for context.
  It remains an estimate, and dense intervals can still require shortening.
- Tests compare the real demo's lane starts, durations, depths, self times,
  screenshots, memory counters and call-frame count before/after filtering.
- Browser tests cover a generated input over 100 MB, gzip comparison windows,
  keyboard/narrow-screen controls, cancellation, and loading a replacement file.
- Unit tests cover malformed/truncated JSON and gzip, split UTF-8, exact hashes,
  bounded histograms, invalid values, profile timing, session release, CLI
  provenance and overwrite refusal.

Private recordings stay local and are not test fixtures or committed artifacts.

An opt-in real-engine calibration can check another local recording without
committing it:

```bash
TRACE_IMPORT_FILE=traces/medium.json pnpm test src/engine/ingest/calibration.test.ts --silent=false
```

`TRACE_IMPORT_WINDOW_US=start,end` optionally supplies absolute microsecond
timestamps, unlike the CLI's relative seconds. The regular suite skips this
private-file calibration.

## Primary references

- [Blob streaming, including Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Blob/stream)
- [DecompressionStream](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream)
- [Streaming parser API and memory behavior](https://github.com/juanjoDiaz/streamparser-json/tree/main/packages/plainjs)
- [Incremental SHA-256](https://github.com/paulmillr/noble-hashes)
- Installed `@paulirish/trace_engine` 0.0.65: `SamplesHandler.js` and
  `CPUProfileDataModel.js`. The profile clock starts at `Profile.ts`, not
  `args.data.startTime`; samples are accumulated and sorted by timestamp.
