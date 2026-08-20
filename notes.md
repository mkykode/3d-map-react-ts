# Implementation Notes

## blocked:benchmark-custody:T005
2026-08-20T14:34Z · verified at d0e3203a7a8f5472f624ad025c9bf9ea92754bfe · T005

- Superseded 2026-08-20: the independent custodian supplied `held-out-v1` with 12 unlabeled cases, 72 hash-indexed envelopes, and a published SHA-256 commitment. T005 now validates the public artifacts without accessing private labels; the orchestrator owns the reviewed freeze commit.
- **If** the held-out corpus, public index, estimator policy, or commitment changes, **then** create a new protocol ID and rerun `src/benchmark/protocol.test.ts` before ranking work. **Stale when** a reviewed phase-boundary commit freezes a newer protocol version.

## gotcha:trace-engine-animation:src/engine/adapter.ts
2026-08-20T04:01Z · verified at d0e3203a7a8f5472f624ad025c9bf9ea92754bfe · T009

- `@paulirish/trace_engine` 0.0.65 passes model configuration to handlers in the processor constructor, then `AnimationFramesHandler.reset()` clears its enabled flag at parse start. `parseTraceForSession()` therefore runs the enabled animation-frame handler once after the main parse; removing that pass makes canonical animation-frame evidence empty.
- **If** the package changes its processor reset/configuration order, **then** remove the adapter-side pass only after `src/engine/adapter.test.ts` proves animation-frame pairs still survive. **Stale when** the package handler retains `enableAnimationsFrameHandler` across reset.

## fact:cpu-source-measurements:src/engine/worker/measurements.ts
2026-08-20T15:58Z · verified at a8817aabe7c0926e9e14be87d50dcde37ffc5dfe · T016

- `AdapterCanonicalEvidence.sourceFrames` preserves the same call-frame order as `ParsedTraceModel.callFrames`; lane `callFrameIds` are one-based indexes into both, so worker scans can sum exact `selfTimes` without moving the projection to the main thread.
- **If** adapter canonicalization changes call-frame ordering or deduplicates either representation independently, **then** add an explicit frame key to the canonical evidence and update `measurements.ts`. **Stale when** `sourceFrames` no longer maps one-to-one to `callFrames`.

## decision:regression-stage:src/scene/RegressionScene.tsx
2026-08-20T15:28Z · verified at a8817aabe7c0926e9e14be87d50dcde37ffc5dfe · T035

- The controlled experiment's `diff` view now renders `RegressionProjection` as the primary stage through one `InstancedMesh`; `AnalysisScope.selectedFindingId` and `selectedEvidenceId` are the shared selection, and projection contributor IDs resolve through the worker-owned contributor map.
- **If** a later view needs same-stage finding focus, **then** use `analysisRegressionProjection` and `focusAnalysisFinding()` rather than deriving coordinates from legacy trace selections. **Stale when** T037 or T055 replaces the retained compatibility-view routing.
