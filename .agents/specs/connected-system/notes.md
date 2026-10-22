# Connected System implementation notes

## Tab order revision: 2026-10-22T05:18:51Z

- The user requested System third after Terrain. Canyon stays first and remains the default.
- The first three shortcuts follow the tabs: Canyon on `Alt+1`, Terrain on `Alt+2`, and System on `Alt+3`.
- Build, lint, 236 unit tests, and both affected browser tests pass. One opt-in calibration test remains skipped.
- Both review gates found no defects in this reorder.
- Rapid view switching logged a Three.js shader-preparation error during verification. The same error reproduced on deployed `e172b14` before this reorder.
- `.agents/FIXES.md` records that separate issue.
- The earlier verification below records the previous order.

## Readability correction: 2026-10-22T05:00:39Z

- The user requested Canyon as the default, with System second, after finding the gray board hard to interpret.
- The System shader suppressed category colors in overview and idle states. Request slabs also used gray.
- Keep category colors visible. Use white outlines for activity, blue for request slabs, and text labels to explain categories.
- The category aggregation test failed before the fix. The rendered-pixel test also failed on the gray board.
- Build, lint, and 236 unit tests pass. One opt-in calibration test remains skipped.
- The 13 affected browser checks pass, including Canyon startup, tab shortcuts, exact palette pixels, deterministic reloads, keyboard access, and playback.
- System still uses seven draw calls. The same-run playback median was 35.1 ms against Canyon's 78.5 ms.
- Category labels now sit higher above buildings to prevent the main-thread label from colliding with a district label.
- All ten System browser tests pass again after the label-spacing correction.
- The unit fixture directory count is zero after verification.

### Behavior verification

- Mode: verify, local changes above `1552430`.
- Checklist: four passed, zero failed, zero blocked.
- Default: `/private/var/folders/s5/zzt53thj1yq4zx4z4j0gh35h0000gn/T/opencode/trace-canyon-default-after.png` shows Canyon on a fresh load, with System second.
- Color: `/private/var/folders/s5/zzt53thj1yq4zx4z4j0gh35h0000gn/T/opencode/trace-system-color-1440.png` shows amber Scripting buildings, a green GPU building, and blue request slabs before playback.
- Labels: `/private/var/folders/s5/zzt53thj1yq4zx4z4j0gh35h0000gn/T/opencode/trace-system-color-1280.png` shows the main thread's category and busy time at the short laptop size.
- Mobile: `/private/var/folders/s5/zzt53thj1yq4zx4z4j0gh35h0000gn/T/opencode/trace-system-color-375.png` shows reachable controls without horizontal overflow at 375 px.
- Findings: dense district labels still use the existing priority culling at narrower widths.
- Scope: this section records local verification before deployment.

## Completed verification: 2026-10-22T04:50:51Z

- All six stories are implemented and verified. Both review gates are complete.
- The user approved request-lifetime markers through the Lavish decision session. The spec records the clarification.
- The demo graph includes 23 recorded Main-to-ThreadPool links and five derived vercel.live-to-monkeykode.com links.
- The demo has 168 unplaced links. The spec's four-link text is an example.
- At 34.24 ms, the browser draws 19 request markers and 45 request slabs.
- System used seven draw calls during playback at 1440×900. The final Chromium run measured a 30.7 ms playback median against Canyon's 55 ms.
- The focused browser run proved deterministic canvases at overview and 34.24 ms, entry navigation, URL clamping, reduced motion, and paused idle rendering.
- The 375 px check exposed a desktop track-picker offset. The corrected check passes keyboard navigation and scoped axe checks.
- City now preserves one activity per entity building. The earlier remainder convention conflicted with Story 5.
- All 235 unit tests pass. One existing test remains skipped.
- City pointer selection and derived caller/callee arcs pass their focused browser check. Canyon's cap and aggregate-endpoint hover also pass.
- The refactor gate identified duplicate definition and provenance types. Both now import or derive their canonical contract.
- Code review reproduced stale packet picking bounds and source evidence hidden by Canyon's retained window zoom.
- Packet updates now refresh their bounding sphere. Opening evidence disables window zoom but preserves the analysis brush.
- A regression unit test failed on the zoom defect before the fix and passes afterward. New browser regressions cover both review findings.
- Manual keyboard verification found that the mobile Camera panel obscured Next moment after focus left the panel.
- The mobile Camera panel now closes when focus leaves. Escape closes the panel and restores button focus.
- The full browser run exposed gesture and mobile journeys that left Camera open over their targets. Those journeys now close or reopen the cluster explicitly.
- The targeted review recheck is clean. Both review regressions and the mobile focus regression pass in Chromium.
- The remaining Canyon screenshot mismatch affected only Camera's hover state. Matching the pointer state restored byte-identical screenshots.
- Build and 235 unit tests pass after the corrections. The opt-in local-file calibration test remains skipped.
- Unit fixture folder counts were zero before and after the final unit run.
- All 67 Playwright tests passed for the initial deployment. The startup check passed with System as the default at that point.
- Visual checks covered 1440×900, 1280×720, and 375×812, including the expanded Camera cluster.
- Build exits successfully with the existing missing `ParsedURL` export, large-chunk, and missing Docker socket warnings.
- ESLint raced Playwright's deletion of `test-results` during an earlier parallel run. Sequential lint passes. `.agents/FIXES.md` records the tooling defect.
- Run pnpm checks with `--config.verifyDepsBeforeRun=false` to prevent automatic dependency reinstall drift. The lockfile remains unchanged.
- The owned development server and browser session are closed. Ports 5199 and 4173 have no listeners.
- The earlier dependency directory remains at `/private/var/folders/s5/zzt53thj1yq4zx4z4j0gh35h0000gn/T/opencode/trace-connected-system-node-modules`.
