# Connected System implementation

Execute `spec.md` in this directory. The scope includes Stories 1 through 6.

## Tasks

- [x] Build and transfer the connection graph. Verify provenance, deduplication, consumer matching, demo counts, and endpoint validity.
- [x] Build the deterministic System layout and shared batched arcs. Verify brush filtering, hidden lanes, picking, and selection details.
- [x] Add playback, moments, narration, URL time, and reduced-motion behavior. Verify the fixed demo playhead and idle rendering.
- [x] Make System the default and first tab. Preserve explicit view hashes and experiment routing.
- [x] Add the bounded Canyon connection layer and entity districts with caller/callee arcs in City.
- [x] Move camera controls beside the minimap. Verify keyboard operation and mobile layout.
- [x] Update documentation and browser journeys. Run the final checks and review the settled diff.

All required checks pass. The refactor findings and code-review defects are resolved. See `notes.md` for evidence and retained warnings.

## Verification strategy

Use real demo parses for graph assertions and buffer transfers. Test pure layout and playback functions at their public interfaces.
Use Playwright for pointer selection, linked views, deterministic pixels, playback, keyboard access, reduced motion, and responsive layouts.
Measure startup, draw calls, and playback frame intervals with the existing debug telemetry.
Run `pnpm build`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e` at the final checkpoint.
Apply the refactor and code-review guidance at the final checkpoint. Mark tasks complete only after the gates pass.

## Repository checks

T041 and T055 remain unchecked in the root task list. City still reads the compatibility projection.
The installed trace engine is 0.0.65. There are no existing ADRs in `docs/adr`.
The spec's consumer rule supersedes the earlier source plan: use the latest request that started before the consumer.
