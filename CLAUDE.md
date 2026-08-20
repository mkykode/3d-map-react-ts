# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Trace Topography: a 3D instrument for Chrome DevTools performance traces (Vite + React 19 + TypeScript + react-three-fiber). Traces are parsed by Chrome DevTools' own trace engine and rendered as five linked views: Canyon (flame chart extruded across thread lanes), Terrain (bucketed busy-time), Rhythm (FlameScope-style seconds x ms-offset fold), City (bottom-up treemap skyline), and Diff (two traces subtracted, aligned at navigation start).

## Commands

Package manager is pnpm. `pnpm-workspace.yaml` exists only to block esbuild postinstall scripts, not for a workspace.

- `pnpm dev` - Vite dev server (demo trace auto-loads from `public/demo-trace.json`)
- `pnpm build` - typecheck (`tsc -b`: app + node + test projects) then `vite build`
- `pnpm test` - Vitest; engine suites parse the real fixture (`public/demo-trace.json`) through trace_engine in Node
- `pnpm lint` - ESLint flat config

CI (`.github/workflows/ci.yml`) runs install, build, lint, test. TypeScript is pinned `<6.1` because typescript-eslint rejects TS 7; bump when its peer range allows.

## Architecture

- `src/engine/` - the data layer, UI-free and fully unit-tested.
  - `adapter.ts` wraps `@paulirish/trace_engine` (the DevTools Performance panel's parser). All reads go through the narrow structural `EngineData` interface at one cast boundary, because the package's real Chromium types churn with Chrome releases. Node lacks `DOMRect`, hence the polyfill guard (needed for Vitest).
  - Output is `ParsedTraceModel` (`types.ts`): per-lane columnar typed arrays (starts/durs/depths/catIds/selfTimes/nameIds, ms relative to trace start) plus markers, screenshots, frames, requests, memory samples, and flow chains resolved to (lane, index) pairs.
  - `worker.ts`/`engineClient.ts` - parsing (JSON decode, optional gunzip, trace_engine, columnarize) happens in a Web Worker; typed arrays transfer back zero-copy. Parse requests are strictly serialized in the worker: trace_engine keeps module-level handler state and concurrent parses corrupt each other (this bug shipped once; the symptom is inflated event counts). The store also guards with per-slot generation counters so stale parses never clobber newer ones. Aggregations (`aggregate.ts`: bucketize, bottomUp with window clipping, rhythmFold, diffTraces) run on the main thread; they are fast array scans.
  - `categories.ts` - DevTools-compatible category semantics and the validated color system (categorical slots in CVD-checked order, sequential blue ramp, red/blue diverging pair, reserved status red). Do not add hues ad hoc; the palette order is the colorblind-safety mechanism.
- `src/scene/` - R3F rendering. Hard rules: event geometry never enters the React tree (one `InstancedMesh` per lane, buffers filled imperatively in `useLayoutEffect`); canyon picking is analytical (`picking.ts` binary-searches columnar data from a hit on an invisible per-lane slab) because per-event raycasting cannot scale to 100k boxes; City/Rhythm use R3F `instanceId` raycasts, which is fine at their bounded instance counts; no `Math.random()` anywhere in rendering. `layout.ts` holds the shared world constants (time along +X, `TIME_W` = 160).
- `src/state/store.ts` - zustand. `useAppStore` (model, view, camera preset, scale, brush, selection, hiddenLanes, zoomed, hudOpen) plus a separate `useHoverStore` so 60 Hz hover only re-renders the tooltip. Brush/selection/hiddenLanes are the linking mechanism across all views, the bottom-up table, and the HUD. `zoomed` makes the canyon render the brush window as its full extent: `windowSlice` (binary search bounded by `meta.maxDur`) culls instances, and `mesh.count` is set per fill against a fixed capacity so buffers never reallocate during drags.
- Profiler-parity UI: `ui/TrackPicker` (which lanes render; structural lanes main/gpu/network never hidden by default), `ui/HudPanel` (live window inspector), drag-to-select on `ui/BrushBar` (drag state lives in a ref because pointer events can outrun renders). `scene/StallBands` marks main-thread-idle-while-blocking-request-in-flight spans (`computeStalls`); render-blocking requests are tinted in the network lane. `scene/CameraRig` flies damped paths (maath) and swaps to ortho only on landing; `scene/GrowIn` animates scene entrances with one group transform per frame.
- `src/lib/urlState.ts` - view/preset/scale/brush round-trip through the URL hash (replaceState writes, hashchange listener for user-edited URLs).

## Constraints worth knowing

- `public/demo-trace.json` is both the demo and the test fixture (1.2 s slice of a real load, screenshots + CPU profile intact). Tests assert exact counts from it (17 screenshots); regenerate it and the assertions together.
- Deterministic rendering is a tested product guarantee: same trace, same pixels. Never add randomness or time-seeded values to the render path.
- trace_engine timestamps are microseconds; everything downstream of the adapter is milliseconds relative to trace start. Convert only in the adapter.
- The old grid/noise prototype (TopoMap/eventCategories/getColorForEvent) is deleted; do not resurrect its patterns.

A full sample trace lives in `data/` (tracked despite the `data/` gitignore entry, which only affects new files). The reviewed redesign plan is in `.lavish/redesign-plan.html` (gitignored); a project verify recipe is in `.claude/skills/verify/SKILL.md`.
