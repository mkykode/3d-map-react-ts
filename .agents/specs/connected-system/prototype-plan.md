# System clarity: approved 3D prototype

Source: [clarity iteration](clarity-iteration.md).

The user approved the proposed R3F prototype through the System clarity review.
The prototype must show ownership in the scene, with stable work heights and routes to actual participants.
The user reviewed the working prototype and selected “Keep this 3D direction” with no additional notes.

- [x] Build stable process regions, owned request areas, and a shared work-height scale. Verify window changes and unknown ownership.
- [x] Render the regions, work scale, request labels, and local/external routes in R3F. Keep picking and playback aligned.
- [x] Add navigation-scoped milestone controls for the same world. Preserve missing evidence and exact Canyon navigation.
- [x] Verify real scenes, keyboard access, mobile states, deterministic pixels, and rendering budgets. Run build, lint, and affected tests.
- [x] Replace the proposal review with actual prototype screenshots and recorded limits. The user accepted the 3D direction.

The user accepted the prototype and authorized its commit, deployment, and push.

## Evidence

Updated: 2026-10-23T01:06:24Z.

- Build, lint, and 245 unit tests pass. One calibration test remains skipped.
- All 36 affected browser checks passed. Fifteen relevant checks passed again after the final camera-resize correction.
- The performance check passes with 11 draw calls. Playback's median is 25.6 ms against Canyon's 55 ms in the same run.
- Captures cover orbit, top, side, the pre-LCP window, 1280×720, and 375×812.
- Before LCP selects 2.64–123.138 ms. Page main-thread work is 91.98 ms. Cloudflare main-thread work is zero.
- The demo contains 40 page-owned requests, four Cloudflare-owned requests, and one Vercel-owned request.
- Unit checks cover unknown requesters, hidden owners, linked requests outside the window, and stable work units.
- Browser checks cover real request picking, exact Canyon evidence, absent milestone evidence, and participant fitting on mobile.
- The refactor gate passed. The code-review rechecks found no remaining defects in the corrected release scope.
- Browser regressions reproduced wide-map camera clipping and selected-request packet starvation before their corrections.
- Nine-region and 32-region maps pass fitting, zoom-out, and resize-preservation checks in every projection at mobile width.
- Selecting request 512 among 513 active consumers now renders its playback marker.
- The manual mobile pass found that details covered Camera actions. The corrected stacking order passed the same pointer interaction.
- The review form queues one final answer in a local stub. The review has no page overflow at desktop or mobile widths.
- Playwright leaves zero result subdirectories after the passing final targeted run. Review captures remain in `.lavish/`.

## Limits

The user accepted the prototype direction. The 2D-replacement regression fix is closed with browser evidence and that visual review.
Dense labels require zoom or participant fitting. Side projection collapses depth and cannot expose every request label at once.
The route limit is 200. The guide retains access to evidence outside that drawing limit.
Recording-wide region labels can differ from request-start ownership and selected-window thread details.

One URL-state assertion failed intermittently. It passed three isolated reruns and the final affected run without a source change.
An isolated rerun exposed the already-recorded Three.js `isReady` error. Its existing fix item remains open.
The full browser suite was not rerun. Build warnings remain ParsedURL, large chunks, and the unavailable Docker socket.

Release regression captures remain local:

- `.lavish/system-wide-map-before.png` shows the clipped nine-region map before the camera correction.
- `.lavish/system-wide-map-mobile.png` shows all 32 regions within the final side projection. Labels cull at that scale.
- `.lavish/system-selected-request-capacity.png` shows the selected request's white playback marker after the packet correction.
