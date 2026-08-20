# Gesture and Device Evidence Matrix

Record evidence on physical hardware unless the row explicitly permits browser emulation. A row passes only when every listed action is reachable and behaves as specified. Link screenshots, videos, traces, or test reports from the Evidence column.

## Result States

- `not-run`: Evidence has not been collected.
- `pass`: The expected behavior was observed and evidence is linked.
- `fail`: The expected behavior was not observed. Link the issue or failure artifact.
- `unavailable`: Required hardware or browser is unavailable. State the reason; this blocks the owning checkpoint when the row is required.

## Required Matrix

| ID | Environment | Required actions | Evidence method | Result | Evidence | Tester and UTC date |
| --- | --- | --- | --- | --- | --- | --- |
| GD-01 | Desktop, Chromium, mouse, viewport at least 1280 x 720 | Import, select finding, drag camera, wheel zoom, reveal evidence, export | Physical desktop | not-run | | |
| GD-02 | Desktop, Chromium on macOS, trackpad | Two-finger pan, pinch at focus, discrete wheel zoom, one-pointer orbit, fit, reset | Physical trackpad | unavailable | Automated Chromium wheel-event coverage passed, including four-direction pan, variable vertical bursts, rapid equal integral wheel steps, isolated wheel zoom, and focus anchoring. Browsers expose no authoritative physical-source flag for pixel-mode vertical wheel events; the implementation treats equal integral steps within 40 ms as strong wheel-step evidence, variable bursts as trackpad evidence, and an isolated event as wheel evidence after a short delay. This remains a heuristic, not physical-source certainty. Physical macOS trackpad and mouse validation remains required. | OpenCode; 2026-08-20 |
| GD-03 | Desktop, non-Chromium, mouse or trackpad | Import, navigate, select finding, reveal embedded source, verify local workspace unsupported reason, export | Physical desktop; name browser and version | not-run | | |
| GD-04 | Touchscreen, Chromium, viewport at least 768 px wide | One-touch orbit, two-touch pan and pinch, select finding, reveal evidence | Physical touchscreen | unavailable | Chrome DevTools Protocol touch emulation passed one-touch orbit and two-touch pinch. No physical touchscreen was available, so this is not a hardware pass. | OpenCode; 2026-08-20 |
| GD-05 | Keyboard-only, Chromium | Import, focus stage, pan, zoom, rotate, fit, focus next/previous, reveal evidence, export without drag | Physical keyboard | not-run | Automated keyboard and non-drag camera coverage passed; physical keyboard-only end-to-end evidence remains required. | OpenCode; 2026-08-20 |
| GD-06 | Reduced motion, Chromium | Change view, focus finding, fit, reset; verify immediate final poses and no non-essential entrance motion | Operating-system reduced-motion setting | not-run | Playwright reduced-motion emulation passed immediate camera and GrowIn final poses; operating-system evidence remains required. | OpenCode; 2026-08-20 |
| GD-07 | 375 x 667 px, Chromium | Reach import, navigation, findings, evidence, source, and export controls without hidden or clipped required content | Browser emulation allowed; confirm one touch device row separately | not-run | Partial Phase 4 evidence: `tests/e2e/camera-idle-accessibility.spec.ts` passed camera-control reachability and 24 x 24 CSS px targets in Chromium 151.0.7922.34 via Playwright 1.62.1. The broader import/evidence/source/export row was not run and is not claimed as a pass. | OpenCode; 2026-08-20 |
| GD-08 | 375 px physical touchscreen, Chromium | Import prepared fixture, navigate, select finding, reveal evidence, inspect source, export | Physical phone | unavailable | No physical 375 px phone was available. Browser viewport and CDP touch emulation are recorded under GD-07 and GD-04 only. | OpenCode; 2026-08-20 |

## Automated Supplement

Automated evidence collected on 2026-08-20 with Chromium 151.0.7922.34 and Playwright 1.62.1:

- `tests/e2e/camera-gestures.spec.ts`: four-direction screen-space pan, variable vertical trackpad bursts, isolated and rapid repeated discrete wheel zoom, focus-anchored pinch/wheel zoom, orbit orientation invariants, top/side pan invariants, Chrome DevTools Protocol one-touch orbit, and anchored two-touch pinch.
- `tests/e2e/camera-actions.spec.ts`: fit-all, fit-selection, reset, stable bounded poses, selection retention, and disabled next/previous controls that expose the T035 same-stage multi-finding dependency.
- `tests/e2e/camera-modes.spec.ts`: default strategy mode, optional free mode, serializable poses, selected experiment evidence retention, and reduced-motion final poses.
- `tests/e2e/camera-idle-accessibility.spec.ts`: zero idle frames for settled main and regression canvases, focused-stage keyboard pan, non-drag camera controls, target sizes, orientation aid, and 375 x 667 px camera-control reachability.

These results supplement but do not replace rows whose Evidence method requires physical hardware or an operating-system setting.

## Evidence Record

For each run, record:

- Device model, operating system, browser name and exact version.
- Viewport dimensions and device pixel ratio.
- Input hardware and whether browser zoom was at 100%.
- Fixture or case ID and commit SHA.
- Expected and observed behavior for every required action.
- Artifact paths or URLs, with secrets and trace source content removed.
- Failures, unavailable capabilities, and follow-up issue IDs.

Do not convert `fail` or `unavailable` to `pass` based on emulation when the matrix requires physical hardware.
