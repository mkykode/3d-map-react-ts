---
name: verify
description: Build, launch, and drive this app in a real browser to verify changes end-to-end.
---

# Verifying Trace Topography

## Launch

```bash
pnpm dev   # run in background; vite.config.ts pins port 5199 with strictPort
chrome-devtools-axi open http://localhost:5199
```

The bundled demo trace auto-loads in a worker. Wait for the toolbar stats before taking screenshots.
The locked dependency set reports 15,498 events across 15 of 28 threads.

## Drive

- Views: Alt+1 through Alt+7 follow the tabs: Canyon, Terrain, System, Rhythm, City, Diff, Vitals. Canyon is the default. To boot
  directly into a view use `http://localhost:5199/#view=terrain`, but only on
  a FRESH page load; hash-only navigation applies via the hashchange listener
  without reparsing.
- Open Camera beside the minimap to reach every camera control. `top` on Canyon must read as a classic flame chart with
  lane labels and a time ruler.
- System: `#view=system&t=34.24` shows 19 request activity markers. These markers do not assert initiator evidence.
- System keeps category colors visible in overview and playback. Main on monkeykode.com is Scripting amber. Request slabs are Loading blue.
- Canyon: Connections starts off. Enable it to inspect at most 200 links and their displayed-count note.
- City: district plates group entities. Selecting an activity highlights its name across districts and draws dashed caller/callee arcs.
- Check System and the expanded Camera cluster at 1440×900, 1280×720, and 375×812. Verify that controls remain reachable without horizontal overflow.
- Hover/click: dispatch real PointerEvents on the canvas via
  `chrome-devtools-axi eval` (R3F listens for pointer events, then a
  synthetic MouseEvent 'click'). Click populates the details panel top-left.
- Rhythm cell click must jump to Canyon with a ~60 ms brush applied and the
  bottom-up table scoped to it.
- Diff: `Compare…` uses a hidden file input; un-hide inputs first:
  `chrome-devtools-axi eval "() => { document.querySelectorAll('input[type=file]').forEach(i => i.hidden = false); return 1; }"`,
  snapshot, `upload @<uid> <file>`. Build a perturbed B-trace:
  `jq -c '{traceEvents: [.traceEvents[] | if .ph == "X" and .pid == 95248 and .dur then .dur = ((.dur * 1.3) | floor) else . end], metadata}' public/demo-trace.json > /tmp/demo-b.json`
  Expect red regressions on the monkeykode lanes.
- Determinism check: screenshot, reload, screenshot, `cmp` PNGs byte-identical.
- `chrome-devtools-axi console` after every drive; the only expected warning
  is the THREE.Clock deprecation from the r3f stack.

## Gotchas

- chrome-devtools-axi refs go stale between invocations; capture the uid and
  use it within one shell command.
- Test fixture = `public/demo-trace.json`; engine tests (`pnpm test`) parse it
  with the real trace_engine in Node.
- If pnpm's dependency freshness hook changes the lockfile, use `pnpm --config.verifyDepsBeforeRun=false` for checks against the installed locked dependencies.
- Run lint after browser tests finish. Playwright recreates `test-results`, and ESLint currently scans that directory.
