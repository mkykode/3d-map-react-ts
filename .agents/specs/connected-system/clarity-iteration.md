# System clarity: 3D correction

Updated: 2026-10-23T01:06:24Z.

## Current status

The user rejected the 2D load sequence as a regression.
System's purpose is to render ownership and communication in the 3D world, with meaningful use of the third axis.
The 2D renderer, mode switch, state, URL handling, and timeline-specific tests have been removed.
The ownership-map prototype implements the accepted 3D direction. The user reviewed the working prototype and selected “Keep this 3D direction.”
The user authorized its commit, deployment, and push.
The [prototype plan](prototype-plan.md) records the current implementation and verification.
The review now leads with actual prototype captures. The original proposal remains in a collapsed history section.

## What went wrong

I treated the selected question, page-load delay investigation, as permission to replace the product's core interaction.
That violated the 3D requirement and duplicated the time-based views.
Passing the implementation tests did not verify the product requirement.
The tests themselves accepted the wrong outcome by expecting the 3D canvas to disappear.

## Restored layout analysis, before the prototype

- `scene/CanyonScene.tsx` uses instanced boxes, actual depth, fixed-face materials, analytical picking, camera-aware detail, and projected labels.
- `scene/traceLayout.ts` maps time to X, stack depth to height, and threads to depth in orbit mode.
- `scene/TerrainScene.tsx` already maps time and threads across the ground plane, with busy time as height.
- `scene/CityScene.tsx` groups activities by entity and renders their self time as building height.
- `scene/systemLayout.ts` positions process plates by ordinal modulo three. That grid does not explain ownership or communication structure.
- The System request rack uses ten columns of equal-sized tiles. Neither ownership nor request lifetime affects those tiles.
- `scene/SystemScene.tsx` routes connections through one anchor per lane. Some connection kinds share endpoints.
- `scene/connectionGeometry.ts` offsets curve height by `id % 3`. The demo's shared-endpoint curves are nearby, not identical paths.
- The demo has 28 connection groups. Eight groups contain same-thread activity, with 836 instances across the recording.
- `scene/systemLayout.ts` normalizes heights against the busiest visible thread in each selected window. That changes the measurement reference between windows.

## Approved prototype direction

System should become a readable **3D component-and-flow map**.

- Ground-plane regions show the page, its embedded components, browser infrastructure, and explicit unknown ownership.
- Within each region, arrange main work, supporting threads, and owned requests into recognizable subregions.
- Vertical height measures recorded exclusive thread work. Put the unit and scale in the scene.
- Keep the layout and height reference stable while changing the time window or replaying activity.
- Use labeled process regions across X and consistent thread/request roles across ground depth. These positions encode categories, not time or physical distance.
- Keep request tiles distinct from work towers. Tile size does not represent request lifetime or blocked time.
- Route connections between actual participants. Separate internal activity from cross-component exchanges so each remains inspectable.
- Place requests beneath their recorded owner. Preserve unknown ownership and requests downloaded from a different host.
- Use milestones to scope the same 3D world. Do not introduce another time-by-lane visualization.
- Preserve provenance. Ownership, temporal overlap, recorded event flow, and URL-matched use are different claims.

The next prototype must prove these encodings in the actual R3F scene.
It must remain understandable in orbit, top, and side views.
The user approved the proposed R3F prototype through the visual review.
Implementation follows [prototype-plan.md](prototype-plan.md).

## Regression guard

The browser suite now checks default System URLs and rejected timeline URLs against the actual WebGL renderer.
It requires multiple instanced buildings with positive, differing heights and different ground depths.
The project instructions now require a 3D System scene and distinguish its subject from Canyon and Terrain.

## Restoration verification

- The build and lint pass. The build retains the existing ParsedURL, large-chunk, and unavailable-Docker warnings.
- The restored source passes 241 unit tests. One opt-in calibration test remains skipped.
- All 15 System and connection browser checks pass.
- The new regression test initially failed typechecking because the installed renderer typings omit `isWebGLRenderer`.
- The corrected test checks the actual WebGL2 context through `getContext()`. Its targeted rerun passes for default and rejected timeline URLs.
- The current System screenshot shows the real R3F scene after removing the mode switch.
- The review page distinguishes restored behavior from an unimplemented spatial proposal.
- The review renders at 1440×900, 1280×720, and 375×812 without page overflow. Its wide schematic scrolls inside its region.
- Its comparison controls switch the real screenshots. Its feedback form queues one final answer after submission in a local verification stub.

These checks verify the restoration. They do not establish that the proposed spatial design solves the clarity problem.
The clarity fix remained open through restoration. The later prototype review accepted the 3D direction and closed the 2D-replacement regression.
At the restoration checkpoint, the clarity changes remained uncommitted and undeployed.

## Earlier iterations

The sections below record earlier work. The second iteration was rejected and removed.

## Goal

Explain each component's role, recorded work, and relationship to the page without requiring browser-internals knowledge.

The user requested iterative improvements to readability, digestibility, information value, and clarity.
The user selected **Understand what delayed the page** as the target decision.
The user liked the first iteration's guide but requested clarity in the visualization itself.

## Rejected second iteration

- Open System in Load sequence. Retain the existing 3D board as Thread map.
- Align component work and owned requests on a common timeline with a chosen page milestone.
- Label main-thread work before and after that milestone directly on each component row.
- Keep two priority request rows visible per component. Expand to at most six without creating per-event React elements.
- Scope milestones and work to the selected hard page navigation. Preserve missing evidence and unknown requesters.
- Distinguish request lifetimes and recorded render-blocking flags from measured blocked time and proven critical paths.
- Preserve linked selection, track visibility, playback, reduced motion, evidence navigation, and keyboard inspection.
- Keep the time ruler visible during vertical scrolling. Narrow screens scroll the timeline within the page.

The demo reaches FCP and its latest LCP candidate 120.498 ms after navigation, at trace time 123.138 ms.
The page records 91.98 ms of main-thread work before that milestone.
Cloudflare records no main-thread work before it and 600.732 ms afterward.
This timing excludes that later work as an explanation for the earlier milestone.

The experiment used a 2D Canvas renderer without a new dependency.
Its scoped milestone and timing findings remain useful evidence, but they did not justify replacing the 3D view.

## First iteration

- Name the page, embedded bot check, feedback widget, graphics process, and network requests.
- Match known products through recorded frame hosts and paths. Preserve unknown roles and mixed-process ownership.
- Rank exclusive recorded work across visible threads in each process. Show the main-thread contribution separately.
- Explain that concurrent work overlaps. Process totals do not measure server response time or one vendor's cost.
- Show request ownership separately from the download host. Keep unknown requesters explicit.
- Explain each connection kind in readable language. Keep provenance and exact Canyon evidence navigation.
- Reserve space for the guide on desktop. Keep the guide reachable below the board on mobile.

## Observable checks

- The real demo identifies Cloudflare Turnstile and Vercel feedback from frame evidence.
- Unknown paths and lookalike domains do not acquire known product labels.
- Selected time windows change both role evidence and work measurements.
- A user can inspect an individual request with the keyboard.
- A user can open a recorded connection's source event in Canyon.
- Playback, reduced motion, category colors, hidden tracks, and deterministic pixels retain their original checks.
- The board stays within its existing 12-draw-call budget.

## Review

The Lavish page shows the restored 3D scene, the Canyon rendering reference, and the corrected spatial design direction.
The review asks for feedback on that concrete 3D direction before another full redesign.
The chosen performance decision remains page-load delay investigation.

## First-iteration verification evidence

- Build and lint pass. The build retains the existing ParsedURL, chunk-size, and unavailable-Docker warnings.
- The unit suite passes 241 tests. One opt-in calibration test remains skipped.
- The full browser suite passed 68 of 69 cases. One keyboard test still assumed the old placement of playback controls.
- The updated keyboard test follows the new guide entry point. All 14 System and connection browser cases passed on the final source.
- Mobile checks cover focus entry, visible selection details, and focus restoration. The 1280×720 check also keeps the brush controls inside the viewport.
- Manual screenshots cover 1440×900, 1280×720, and 375×812. The browser reported no errors during those checks.
- The full browser run measured seven System playback draw calls. Median frame intervals were 30.6 ms for System and 61.1 ms for Canyon.
- Those timings use the local development server and Chromium's SwiftShader renderer. They are not field measurements.
- The final diff passes whitespace checks. The dependency lockfile has no changes.

The review artifact is `.lavish/system-clarity-review.html`.
The first iteration remained local for feedback.

## Historical checks for the rejected second iteration

- Build and lint pass. The build retains the existing ParsedURL, chunk-size, and unavailable-Docker warnings.
- The unit suite passes 247 tests. One opt-in calibration test remains skipped.
- Six load-sequence tests cover real-demo timing, ownership, navigation boundaries, hidden tracks, missing evidence, and deterministic aggregation.
- All 14 existing System and connection browser checks pass with explicit Thread map URLs.
- Four new browser checks cover default mode, URL round-trips, milestone zoom, pointer selection, Canyon evidence navigation, and missing paint markers.
- Those checks also cover deterministic canvas pixels, reduced-motion playback, zero paused redraws, mobile keyboard activation, focus return, and timeline scrolling.
- The new timeline passes the scoped automated WCAG A/AA check. This does not establish whole-page accessibility conformance.
- The retained Thread map performance check passes with seven draw calls and a 40.4 ms median frame interval against Canyon's 73.9 ms.
- Screenshots cover 1440×900, 1280×720, and 375×812. The smaller timeline scrolls internally while the guide remains reachable.
- The review page uses current screenshots. Its images load, and its feedback form sends the selected answer to a local verification stub.
- The final diff passes whitespace checks. No dependency or lockfile changed.

The browser run initially exposed an incorrect native-select keyboard expectation.
Inspection now has an explicit Open selected item action, with verified keyboard activation and focus restoration.
The full browser suite was not repeated for this iteration. The affected suites supplied the checks above.
