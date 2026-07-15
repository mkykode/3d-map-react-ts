# Trace Topography

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

Overlays: web-vitals beacons (Nav/FP/FCP/LCP/DCL/Load), long-task markers
(red bars over the main thread for tasks &gt;50 ms, tinted in the canyon too),
screenshot filmstrip, per-frame floor tiles (dropped frames in red), JS-heap
memory river, and causality arcs from the trace's flow events when an event
is selected.

Everything is linked: the time brush filters the terrain, city, and bottom-up
table and dims the canyon; clicking a rhythm cell opens that slice in the
canyon; clicking a city building or table row highlights those events
everywhere.

## Usage

```bash
pnpm install
pnpm dev
```

A bundled demo trace loads automatically. Load your own with **Load trace**
(a `.json` export from the DevTools Performance panel, `chrome://tracing`, or
Puppeteer/Playwright tracing). **Compare…** loads a second trace for diff
mode.

Controls: keys `1-5` switch views · `orbit/top/side` camera presets ·
`W/A/S/D` zoom and pan · click an event for details and causality arcs ·
`Esc` clears the selection. View, camera preset, scale, and brush are
URL-shareable via the hash.

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
pnpm build   # tsc -b && vite build
pnpm lint    # eslint
```

The demo trace (`public/demo-trace.json`) doubles as the test fixture: a
1.2 s slice of a real page load with metadata, screenshots, vitals markers,
and the sampled CPU profile intact.
