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

The bundled demo trace auto-loads (parse takes ~2-5 s in the worker; wait
before screenshotting). Expect the toolbar stats to read ~20k events across
12/28 threads.

## Drive

- Views: keys 1-5 or the tabs (Canyon, Terrain, Rhythm, City, Diff). To boot
  directly into a view use `http://localhost:5199/#view=terrain`, but only on
  a FRESH page load; hash-only navigation applies via the hashchange listener
  without reparsing.
- Camera presets: `top` on Canyon must read as a classic flame chart with
  lane labels and a time ruler.
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
