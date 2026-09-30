# Trace Topography

**Live demo:** <https://trace.monkeykode.com>

A 3D instrument for Chrome DevTools performance traces. It parses traces with
Chrome DevTools' own trace engine, then spends the third dimension on the
things a flat flame chart cannot show: cross-thread landscapes, periodicity,
aggregate hotspots, and trace-to-trace diffs.

Every spatial axis encodes a declared variable, renders are fully
deterministic, and each orthographic camera preset collapses back into a 2D
chart you already know: the top view of the canyon **is** the DevTools flame
chart.

## Views

| View | Question it answers | Axes |
|---|---|---|
| **Canyon** | Where does the time go, per thread, over time? | X time · Y stack depth · Z thread lane |
| **Terrain** | What is the shape of this load? | X time · Y busy per bucket · Z track |
| **Rhythm** | Is the jank periodic? (FlameScope, extruded) | X seconds · Z ms offset within second · Y busy |
| **City** | Who costs the most overall? | footprint calls · height self time |
| **Diff** | What regressed between two traces? | signed Δ busy, aligned at navigation start |
| **Vitals** | Which lab milestones does the trace prove? | 2D workspace: marker-backed LCP/FCP/DCL/Load, with unsupported metrics explicitly unavailable |

Overlays: web-vitals beacons (Nav/FP/FCP/LCP/DCL/Load), long-task markers
(red bars over the main thread for tasks &gt;50 ms, tinted in the canyon too),
screenshot filmstrip, per-frame floor tiles (dropped frames in red), JS-heap
memory river, and causality arcs from the trace's flow events when an event
is selected.

Everything is linked: drag across the overview strip (DevTools-style) to
select a window; the window filters the terrain, city, and bottom-up table
and dims the canyon. **Zoom to window** re-renders the canyon with only the
selected slice, so detail gets cheaper the deeper you go. Clicking a rhythm
cell opens that slice zoomed in the canyon; clicking a city building or
table row highlights those events everywhere.

Profiler parity tools:

- **Tracks** (T): choose which threads feed the scene, like the DevTools
  track list.
- **Inspector HUD** (I): a toggleable overlay that live-updates with the
  selected window's story: events, per-category self time, long tasks,
  requests (with render-blocking count), network-stall time, and vitals.
- **Network insight**: requests get collision-free waterfall rows,
  render-blocking requests are tinted, and translucent bands mark spans
  where the main thread idles while blocking requests are in flight.
- **Cinematic motion**: camera preset and view changes fly on damped paths
  and scenes grow out of the ground plane; the cost is one transform per
  frame regardless of event count.

## Usage

```bash
pnpm install
pnpm dev
```

A bundled demo trace loads automatically. Load your own with **Load trace**
(a `.json` export from the DevTools Performance panel, `chrome://tracing`, or
Puppeteer/Playwright tracing). **Compare…** loads a second trace for diff
mode.

### Large recordings

Files above 32 MiB and gzip files open a local streaming overview before loading.
Choose **Load full recording** when the retained events fit, or select a time
interval. **Change interval** reuses the same file without another file picker.
Both primary and comparison traces support this workflow.

The worker reads bounded chunks and filters before building the DevTools model.
It removes `v8.callFunction` wrappers, V8 debugger bookkeeping and embedded
source-rundown events, preserves CPU profile timing and node definitions, and
does not thin memory counters. Because the wrappers were stack levels in the
exact model, calls nested inside them sit one level shallower and their parents
show more self time than an exact import; DevTools hides the same wrappers.
The scope notice lists reductions. Windowed views can lose network and
asynchronous relationships crossing their boundaries, and are not complete
page-load measurements. Controlled experiments still require original traces;
reduced imports are rejected as experimental evidence.

Current safety budgets: 8 GiB input, 16 GiB decompressed, 16 MiB per event/metadata
value, 128 nesting levels, and at most 400,000 retained events / 80 MiB retained
JSON. The existing 1.5 GiB aggregate memory projection still applies. These are
safety estimates, not a guarantee for every browser or trace. Dense windows or
large CPU node dictionaries may require a smaller recording.

For local preparation outside the browser, use Node 24 or newer:

```bash
pnpm trace:prepare traces/big.json.gz --inspect
pnpm trace:prepare traces/big.json --window 12s-24s --output traces/prepared.json
pnpm trace:prepare traces/medium.json --output traces/prepared-full.json
```

Window times are seconds from the first retained timed event. The CLI shares the
browser's filter and budgets, writes provenance into the output, refuses to
overwrite any existing file, and never modifies the original. A canceled or
failed preparation removes only its newly created, incomplete output.

Controls: `Alt+1..6` (Option on macOS) switch views · `orbit/top/side`
camera presets · `W/S` zoom, `A/D` + arrow keys pan (in top/side, left-drag
pans as well) · drag the overview strip to select a window · `Alt+Z` zoom
to window · `Alt+T` tracks · `Alt+I` inspector · click an event for details
and causality arcs · `Esc` clears the selection. View, camera preset,
scale, and brush are URL-shareable via the hash.

## Architecture

```
src/
  engine/   @paulirish/trace_engine adapter (Web Worker), columnar typed
            arrays, bucketing / bottom-up / rhythm-fold / diff aggregations
  scene/    R3F scenes: instanced lanes & terrain, analytical picking,
            overlays, camera rig
  state/    zustand stores (model, view, selection, brush) + hover isolate
  ui/       toolbar, legend, details, bottom-up table, brush, tooltip
  lib/      squarified treemap, URL hash state
```

Design rules the code enforces:

- **Zero synthetic data.** No noise, no random colors; the same trace renders
  the same pixels every time.
- **Instancing only.** Event geometry never enters the React tree; each lane
  is one `InstancedMesh`, so 100k+ events render at interactive rates.
- **Analytical picking.** The layout is axis-aligned, so hover resolves by
  binary search over the columnar data instead of raycasting boxes.
- **Validated color.** Categories use a CVD-validated palette in a fixed
  order (DevTools-compatible semantics); magnitude uses a single-hue ramp;
  diffs use a red/blue diverging pair around a neutral gray; status red is
  reserved for long tasks and dropped frames.

## Development

```bash
pnpm test    # Vitest: engine adapter + aggregation suites (real-trace fixture)
pnpm build   # tsc -b && cf build
pnpm lint    # eslint
```

The demo trace (`public/demo-trace.json`) doubles as the test fixture: a
1.2 s slice of a real page load with metadata, screenshots, vitals markers,
and the sampled CPU profile intact.
