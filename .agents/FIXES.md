# Fix list

Defects in this repository's code, config, scripts, or tests that a change would prevent.
Sessions do not load this file. `lessons show` prints how many items are open, and consolidation
works them.

One line per item, newest at the bottom: `- YYYY-MM-DD · trace · defect · done when`. Record one
with `lessons fix . "<defect>" "<done when>"`. A repeat bumps its ×N count. Once the done-when
check exists, close the item with `lessons close <id> --by "<what fixed it>"`.

## Open

- 2026-10-21 · trace · ESLint scans Playwright output while Playwright recreates test-results, so concurrent checks can fail with ENOENT. · ESLint ignores generated Playwright output, and concurrent lint plus test:e2e complete without directory-scan races.
- 2026-10-21 · trace · Rapid Terrain-to-System switching rejects shader preparation with an `isReady` TypeError on deployed e172b14 before the tab reorder. · A browser regression switches views rapidly and reloads explicit view hashes without page errors or a missing workspace.
