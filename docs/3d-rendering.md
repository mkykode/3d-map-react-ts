# 3D rendering contracts and verification

The renderer is a data instrument. Game techniques help people read and navigate it, but must not alter duration, cost, category, or evidence identity.

## Coordinates and picking

- `traceLayout.ts` is shared by Canyon rendering, picking, feedback, and camera fitting. Time runs along +X. Orbit places the first Main lane nearest the initial camera. Top unfolds stack rows along Z. Side separates lanes along Y and looks from positive Z, so time stays left to right.
- Deep stacks use one linear scale across all visible lanes. There is no overlapping depth cap. The demo contains a 160-level stack.
- Duration controls width. Stack level controls elevation in Orbit/Side. Thickness encodes self-time share, with an 18% baseline and 72% proportional range. Thickness is not an absolute self-time scale. Top is a flattened flame-chart projection.
- Picking intersects the actual displayed axis-aligned boxes through per-depth interval indexes. Colliders are draw-free Object3D objects. Nearest hits stop propagation. No scan of every raw event runs on pointer move.
- Mouse click coordinates can be rounded while PointerEvent coordinates retain fractions. `pointerEvents.ts` preserves the release position for the following nearby click, so subpixel rows do not hover successfully and then miss on click.

## Level of detail and updates

- Canyon merges subpixel neighbours only within the same stack row and a two-pixel time bin. Gaps larger than a pixel remain gaps. Category is duration-weighted; status warnings survive aggregation.
- A displayed aggregate is identified as an aggregate. Clicking expands its time interval. It never silently selects an arbitrary source event. The picking index contains displayed spans, not omitted slivers.
- Pixel thresholds use quantized levels and hysteresis. Instance buffers have fixed capacity, dynamic usage, and populated update ranges. Lane bounds are assigned analytically.
- Unzoomed brushing and name selection update shader uniforms rather than rewriting base instance matrices and colors. Named selections get a separate bounded subset overlay. Up to 128 fixed-pixel dots per affected lane annotate selected calls too small to draw faithfully.
- LOD changes and camera movement clear obsolete hover information. Selection uses an independent outline proxy rather than post-processing all instances.
- Hover records identify their source view explicitly; aggregate views never impersonate negative thread IDs. Empty-canvas clicks preserve selection. Escape and the Clear selection button clear it.
- Rhythm has at most 256 columns by 100 cells. Long recordings group seconds explicitly. Continuous exclusive-time spans accumulate by grouped columns, not by walking millions of ten-millisecond intervals.
- `engine/rhythmLayout.ts` defines temporal grouping once for aggregation, scene layout, selection bounds, and camera fit.
- City retains 59 activities plus a labeled remainder when necessary. Remainder totals and zero-self, positive-inclusive-time activities are not discarded. Footprint encodes inclusive time, height encodes self time. Inclusive totals can overlap between nested calls.
- Terrain preserves category mixtures within each time bucket. CPU height is utilization; network height is normalized to peak aggregate request time. Selected calls in Terrain/Rhythm are labeled range annotations, not per-call geometry.

## Readability and camera

- Canvas uses `flat`; data materials use explicit unlit face shades. Top faces preserve the category hex exactly. Side faces use fixed 0.78/0.64 linear-light multipliers. Lighting does not change category identity when the camera rotates.
- Shader borders provide pixel-width face separation without an extra outline pass. Screen-space labels use fixed CSS pixels, priority, and collision culling. They do not shrink or foreshorten with distance.
- A fading ground grid and environment fog provide orientation. Data colors and labels are excluded from fog. City and Terrain use one-shot contact shadows. Diff improvements remain visible below their zero plane.
- Every view supplies its own bounds. Selection fitting resolves to that view's geometry, including carried entry selections and City's remainder. Main-stage projection offsets account for overlay space.
- Near plane is 1. Manual perspective distance and orthographic zoom are bounded. Strategy keeps the camera above ground; Free permits below-ground orbit and pan. Ground surfaces are front-sided so they do not conceal data from underneath. Switching back to Strategy reapplies its safety bounds.
- Perspective approaches to Top and Side cap vertical field of view at 90 degrees, dollying back as needed to match orthographic target-plane scale before swapping cameras. These automatic approaches can exceed the manual orbit distance limit so tall layouts remain reachable.
- Held navigation keys use delta-time acceleration and deceleration. Pointer, touch, keyboard, reduced-motion, cursor anchoring, and idle behavior have browser tests.
- The minimap shows the clipped view footprint and live heading. The overview also shows the visible time interval independently of the analysis brush.
- Screenshot textures retain aspect ratio and sRGB color, set anisotropy, upload after decoding, invalidate demand rendering, and dispose when replaced.
- Shader programs warm without blocking. `ShaderWarmup` mounts zero-count instanced probes carrying every data shader variant from first paint, so those programs compile during the worker parse and stay cached, and it calls `compileAsync` on each scene change. drei's synchronous `Preload` compiled every material in one GPU-process stall of about 0.9 s at model arrival on ANGLE/Metal; replacing it cut dev-mode time-to-stable from a 2.0 s median to 1.5 s (HEAD before this work: 1.1 s).
- Only preset, view, or content bounds may fly the camera home. Viewport size and camera mode stay out of the flight key: a window resize or a mode toggle never discards the user's navigation.
- Camera position, target, and zoom props seed each projection only on mount. Flight and navigation controllers own subsequent changes. Resize updates projection dimensions and overlay offsets, not the navigated pose. Explicit Fit/Reset commands use the current viewport.
- Test render telemetry is opt-in with `?debug`. A scene error boundary keeps trace analysis available if the 3D renderer fails.

## Why some proposed game techniques were not added

GPU ID picking adds an extra pass and GPU readback. The existing axis-aligned data supports exact indexed ray intersections without either cost. It remains analytical rather than adding a second picking implementation.

A fixed directional light plus a hemisphere light cannot preserve all palette faces through arbitrary camera rotation. Explicit per-face shading makes the color contract testable. This is deliberate data rendering, not physically based material simulation.

Full-screen ambient occlusion, bloom, depth of field, and global outline passes are not prerequisites for game-quality interaction. They add cost and can obscure thin data. The current depth treatment uses borders, stable face shades, ground cues, and cached contact shadows.

## Measurements

The recorded fixture is `data/Trace-20250104T162142.json`. Its parsed model spans 5,412.103 ms. It is not a 70-second trace. The separate synthetic test has 100,000 events over 69,999.9 ms.

| Recording and renderer | Visible source events | Rendered instances | Draw calls | Navigation median | Navigation p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Recorded, Apple M2 Ultra / ANGLE Metal | 156,469 | 2,354 | 18 | 16.7 ms | 16.8 ms |
| Recorded, Chromium / SwiftShader | 156,469 | 2,354 | 18 | 62.3 ms | 74.2 ms |
| 70-second synthetic, Chromium / SwiftShader | 100,000 | 547 | 4 | 22.4 ms | 43.4 ms |

These are local observations, not a universal 60 fps guarantee. The hardware run sampled 120 requestAnimationFrame intervals during held-key orbit. Automated performance tests sample 60 intervals with Playwright tracing disabled and record the renderer backend. The two backends are not comparable as hardware benchmarks. Results use the default visible tracks, not every thread in the file. Event reduction is not the same as discarding trace data: raw data stays available when zooming.

Run `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e`. `render-performance.spec.ts` records source counts, instance counts, draw calls, parse time, backend, median, and p95. `visualization.spec.ts` tests real pointer picking, feedback, aggregate expansion, unchanged base buffers, color readback, linked selections, and opt-in telemetry.

The initial repair passed build, lint, 176 unit tests in 37 files, and all 42 browser tests. That verification removed viewport size from the flight key and replaced drei's synchronous `Preload`, which doubled dev-mode startup. The reduced-motion test waits for the published camera bounds to change after a view switch instead of the entrance-animation attribute, which no longer changes.

Follow-up verification found that live camera props still overwrote navigation on resize and mode changes, even without a scheduled flight. Nine new browser regressions failed on the starting tree, then passed after the mount-only camera seeds, unrestricted Free mode, selection preservation, and bounded-FOV landing changes. The follow-up passed build, lint, 197 unit tests in 38 files, and all 51 browser tests. The tall Side fixture previously reached 154.47 degrees; it now stays at or below 90 degrees and changes target-plane scale by less than 1% when switching to orthographic. New unit coverage also checks the shared Rhythm grouping at range and cell-size boundaries.

The obsolete `src/scene/GrowIn.tsx` animation was removed because it scaled data geometry during entrance. The original file remains recoverable from Git history. No trace fixtures were deleted.

The build still reports the dependency's missing `ParsedURL` export and the large application chunk. R3F currently emits Three's Clock deprecation warning. These warnings are not hidden. Software rendering remains slower than the hardware target; performance on low-end/mobile GPUs needs device-specific profiling.

## Documentation audited

The audit covered the APIs used by this renderer, not literally every page in the Three.js site. Installed Three is r185; installed R3F and drei sources were checked against the official contracts.

- [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html), [BufferAttribute](https://threejs.org/docs/pages/BufferAttribute.html), [Material](https://threejs.org/docs/pages/Material.html), [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- [Ray](https://threejs.org/docs/pages/Ray.html), [picking](https://threejs.org/manual/en/picking.html), [LOD](https://threejs.org/docs/pages/LOD.html), [optimizing many objects](https://threejs.org/manual/en/optimize-lots-of-objects.html)
- [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html), [PerspectiveCamera](https://threejs.org/docs/pages/PerspectiveCamera.html), [color management](https://threejs.org/manual/en/color-management.html), [Texture](https://threejs.org/docs/pages/Texture.html), [Fog](https://threejs.org/docs/pages/Fog.html), [HemisphereLight](https://threejs.org/docs/pages/HemisphereLight.html)
- [R3F Canvas](https://r3f.docs.pmnd.rs/api/canvas), [events](https://r3f.docs.pmnd.rs/api/events), [scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance), [pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)
- [drei Html](https://drei.docs.pmnd.rs/misc/html), [Grid](https://drei.docs.pmnd.rs/gizmos/grid), [Preload](https://drei.docs.pmnd.rs/performances/preload)
