# Tasks: Evidence-First Trace Topography Rebuild

**Source spec**: `spec.md`
**Generated**: 2026-08-19
**TDD**: active; Vitest is established, browser-driven seams are required, and no user or project instruction opts out of automated tests

## Checkbox Legend

- `- [ ]` - Not started
- `- [v]` - Implemented; focused checks pass; phase completion gates pending
- `- [x]` - Completed
- `- [~]` - Blocked or needs external input
- `- [!]` - Failed or needs manual intervention

Tasks tagged `[TDD: AC-N.M]` implement observable behavior and must be test-driven. `/mk:implement` writes a failing test per listed AC and marks the task `[v]` after focused evidence passes. The dependency-ordered pipeline orchestrator marks it `[x]` only after all owned gates are green.

## Phase 1: Setup

Confirm test seams, add browser automation, and create safe fixtures and real-device evidence templates before production work.

- [x] T001 Verify the existing Vitest red-green harness through `package.json` and `tsconfig.test.json`; bootstrap only if `pnpm test` cannot demonstrate a temporary failing then passing smoke assertion in `src/test/harness.test.ts`
- [x] T002 [P] Add the browser workflow harness and deterministic dev-server lifecycle in `package.json`, `playwright.config.ts`, and `tests/e2e/smoke.spec.ts`
- [x] T003 [P] Add deterministic full-envelope, 3+3, 4+3, 4+4, 5+5, under/over-cardinality cohort, source-map, evidence-case, oversized-input, compression-bomb, traversal, and malformed-payload fixture builders in `src/test/traceEnvelopeFixtures.ts`, `src/test/experimentFixtures.ts`, `src/test/untrustedInputFixtures.ts`, and `tests/e2e/fixtures.ts`
- [x] T004 [P] Create the required desktop, trackpad, touchscreen, keyboard, reduced-motion, Chromium, non-Chromium, and 375 px real-device evidence matrix in `docs/verification/gesture-device-matrix.md`

## Phase 2: Foundational

Establish benchmark rules, worker ownership, fail-closed ingestion, complete canonical storage, source identity, and narrow transfer contracts before any ranking implementation.

- [x] T005 [P] [TDD: AC-0.5] Preregister and freeze a numeric held-out corpus size, semantic target granularity, estimator family/parameters, permitted tuning corpus/rules, prohibition on held-out tuning, top-three scoring, tie handling, participant criteria, equal training, randomized tool order, exclusions, failures, tracked corpus custody, and result schema in `benchmarks/preregistration.json`, `benchmarks/estimator-policy.json`, `benchmarks/tuning/manifest.json`, `benchmarks/known-regressions/manifest.json`, `benchmarks/held-out/README.md`, `benchmarks/commitments/ground-truth.sha256`, `src/benchmark/protocol.ts`, `src/benchmark/protocol.test.ts`, and `docs/benchmark-protocol.md`; the sealed ground truth is unavailable to ranking implementers, ranking code cannot read its commitment/custody material, and estimator/ranking tasks may not begin until these artifacts are committed
- [x] T006 Define versioned opaque `SessionId`, `AnalysisScope`, `AnalysisJob`, `Finding`, evidence identity/level/availability, self-contained `EvidenceCase`, worker request/response, and transfer-allowlist contracts in `src/domain/analysis.ts`, `src/domain/evidence.ts`, `src/domain/evidenceCase.ts`, `src/engine/protocol.ts`, and `src/engine/limits.ts`; support 3-5 baseline and independently 3-5 candidate runs, subject to a 1.5 GiB aggregate of retained canonical sessions plus projected in-flight peak memory, and set hard ceilings of 256 MiB imported bytes, 768 MiB streaming-decompressed bytes, 5,000,000 events, 32 MiB per resource, 64 MiB per source map, source-map depth 8, 256 MiB retained source data per session, 64 MiB per projection, and 16 MiB per evidence slice; peak admission must use measured amplification for compressed/input buffers, UTF-8 decoding and JS strings, JSON.parse/raw events, trace_engine structures, and canonicalization overlap from `docs/performance/ingestion-memory-calibration.md` rather than payload size alone (implements FR-008, FR-017, FR-025)
- [x] T007 [TDD: AC-1.4, AC-0.7] Implement the worker-owned `TraceSessionRepository` lifecycle before ingestion in `src/engine/worker/sessionRepository.ts` and `src/engine/worker/sessionRepository.test.ts`; admit 3-5 runs per cohort and retain 6-10 ready canonical sessions behind opaque IDs only while aggregate retained plus projected in-flight peak memory fits T006, with explicit reserve/ingest/canonicalize/commit/cancel/dispose states, peak/retained byte accounting, no silent eviction, and deterministic progress; after canonical commit retain hashes, metadata/settings, canonical evidence, screenshots, resources/source maps, and scan indexes, but release imported/compressed/decompressed bytes, decoded JSON text, raw event arrays, and trace_engine structures (implements FR-003; NFR-001, NFR-002, NFR-007)
- [x] T008 [TDD: AC-0.1, AC-0.7] Implement streaming full-envelope ingestion in `src/engine/worker/fullEnvelope.ts`, `src/engine/worker/hash.ts`, `src/engine/worker/fullEnvelope.test.ts`, and `docs/performance/ingestion-memory-calibration.md`; preserve metadata/settings/resources, hash exact imported bytes before discard as `importSha256`, hash decompressed JSON bytes as `payloadSha256` for gzip inputs, make both hashes equal for uncompressed inputs, enforce compressed/decompressed limits during streaming, measure fixture/demo amplification and reserve projected decode/JSON.parse/trace_engine/canonicalization peak memory before materialization, reject every limit or aggregate-headroom violation rather than truncate, stage the envelope only until T007 canonical commit, and prove all ingestion intermediates are released afterward (implements FR-001, FR-003, FR-008; NFR-001, NFR-002)
- [x] T009 [TDD: AC-0.1] Adapt trace_engine canonicalization in `src/engine/adapter.ts`, `src/engine/worker/traceSession.ts`, and `src/engine/adapter.test.ts` to receive the preserved envelope metadata/settings, enable required animation-frame handling, convert microseconds only at the adapter seam, and store complete CPU/source-frame, navigation, request, frame, metric, interaction, layout-shift, memory, resource, screenshot, and provenance data only in T007 (implements FR-003, FR-008, FR-015, FR-016, FR-019, FR-020; NFR-001, NFR-002, NFR-003)
- [x] T010 [TDD: AC-0.1] Add TraceSession conservation and narrow-response builders in `src/engine/worker/conservation.ts`, `src/engine/worker/projections.ts`, and `src/engine/worker/conservation.test.ts`; prove complete event/resource/source counts survive canonicalization while only manifests, findings, bounded `ParsedTraceModel` projections, and requested evidence slices cross to the main thread (implements FR-003, FR-008; NFR-002, NFR-003)
- [x] T011 [TDD: AC-3.2, AC-6.1, AC-6.2, AC-6.4] After T009, normalize authored-source identity, parse source maps, and complete the minimal worker tracer resolver in `src/engine/worker/sourceIdentity.ts`, `src/engine/worker/tracerSource.ts`, `src/source/sourceMap.ts`, `src/source/uriPolicy.ts`, `src/source/sourceIdentity.test.ts`, and `src/engine/worker/tracerSource.test.ts`; resolve an exact embedded generated snippet and a valid regular/index-map authored snippet with generated fallback, and cover hashed assets, missing/malformed/stale maps, inline scripts, ambiguity, unavailable reasons, data/blob/http URI policy, no ambient fetch, and T006 size/depth limits (implements FR-006, FR-019, FR-020, FR-022; NFR-001)
- [x] T012 [TDD: AC-1.4, AC-0.7] Implement serialized worker-owned parse, canonicalize, cohort-scan, projection, evidence-slice, cancellation, disposal, and supersession jobs in `src/engine/worker/jobController.ts`, `src/engine/worker.ts`, and `src/engine/worker/jobController.test.ts`; cohort scans never execute on the main thread and canceled jobs cannot publish stale results (implements FR-001, FR-003, FR-004; NFR-007)
- [x] T013 [TDD: AC-0.1] Replace main-thread model ownership with opaque session manifests and bounded responses while retaining the existing `ParsedTraceModel` projection compatibility path in `src/engine/engineClient.ts`, `src/state/store.ts`, `src/engine/protocol.test.ts`, and `src/state/store.test.ts`; the client must reject any response containing a complete TraceSession (implements FR-003, FR-008; NFR-001, NFR-003)
- [x] T014 [P] [TDD: AC-0.7] Implement fail-closed availability, evidence-level, omission, incompatibility, cancellation, unsupported-platform, and security-limit presentation primitives in `src/evidence/availability.ts`, `src/ui/AvailabilityNotice.tsx`, `src/ui/EvidenceLevelBadge.tsx`, and `src/evidence/availability.test.ts` (implements FR-004, FR-007, FR-017, FR-022)

## Phase 3: User Story 1 - Import a Controlled Experiment

**Goal**: Deliver the first vertical tracer bullet: import compatible 3-5-run baseline and candidate cohorts, rank one CPU/source-frame regression, select one 3D mark, and inspect exact generated/authored fallback evidence.

**Independent test criteria** (from spec Acceptance Criteria):

- AC-1.1 through AC-1.4 and AC-0.2: Every aggregate-memory-valid 3-5 by 3-5 cohort, including 3+3, 4+3, 4+4, and 5+5, becomes analysis-ready with coverage, progress, cancellation, explicit cardinality/incompatibility reasons, and unknown missingness; the tracked demo also reaches a provisional stable workspace within 3 seconds.
- AC-3.1, AC-3.2, AC-3.4, and AC-3.5: One CPU/source-frame finding reports cohort effects, dispersion, stable source identity, conservative status, and complete provenance.
- AC-4.1, AC-4.2, AC-4.4, AC-6.1, AC-6.2, and AC-6.4: One selectable 3D mark opens exact 2D and generated/authored fallback source evidence without fabricated joins.

- [x] T015 [US1] [TDD: AC-1.1, AC-1.2] Implement worker-side experiment manifests with independent 3-5 baseline and 3-5 candidate cardinality, aggregate-memory admission, explicit scenario/navigation selection, capture-context compatibility, accepted differences, and pre-ranking coverage gates in `src/engine/worker/experimentManifest.ts` and `src/engine/worker/experimentManifest.test.ts`; prove 3+3, 4+3, 4+4, and 5+5 pass when memory-valid, while fewer than 3, more than 5, or aggregate-budget overflow fails with a specific reason (implements FR-001, FR-002, FR-004)
- [x] T016 [US1] [TDD: AC-1.3] Implement nullable worker-side CPU/source-frame measurements and completeness accounting in `src/engine/worker/measurements.ts` and `src/engine/worker/measurements.test.ts` so absent evidence is excluded and labeled rather than coerced to zero (implements FR-007)
- [x] T017 [US1] [TDD: AC-1.1, AC-1.2, AC-1.3, AC-1.4] Ship variable 3-5 by 3-5 import, labeling, scenario selection, compatibility/memory review, coverage/omission report, progress, cancel, and disposal controls in `src/ui/ExperimentImport.tsx`, `src/ui/ExperimentManifest.tsx`, `src/ui/CaptureCoverage.tsx`, `src/App.tsx`, and `tests/e2e/experiment.spec.ts` using only T013 manifests/status responses (implements FR-001, FR-002, FR-004, FR-007)
- [x] T018 [US1] [TDD: AC-3.1, AC-3.2, AC-3.4] Implement the preregistration-compatible minimal CPU/source-frame cohort scan and ranking inside the worker in `src/engine/worker/cpuSourceAnalysis.ts` and `src/engine/worker/cpuSourceAnalysis.test.ts`, using T011 authored identity with generated fallback and returning finding summaries only (implements FR-005, FR-006, FR-007)
- [x] T019 [US1] [TDD: AC-3.5] Attach exact run/session IDs, `importSha256`, `payloadSha256`, scenario/navigation scope, event keys, source identity/mapping state, derivation version, algorithm parameters, and evidence labels in `src/engine/worker/provenance.ts` and `src/engine/worker/provenance.test.ts` (implements FR-008)
- [x] T020 [US1] [TDD: AC-4.1, AC-4.2, AC-4.4, AC-6.1, AC-6.2, AC-6.4] Return one deterministic bounded CPU/source-frame mark and its on-demand exact baseline/candidate, generated-snippet, authored-snippet-or-generated-fallback, provenance, and unavailable-reason slice from `src/engine/worker/regressionProjection.ts`, `src/engine/worker/evidenceSlice.ts`, and `src/engine/worker/tracerBullet.test.ts`; complete sessions and unrequested evidence remain in T007 (implements FR-009, FR-010, FR-011, FR-019, FR-020, FR-022)
- [x] T021 [US1] [TDD: AC-4.1, AC-4.2, AC-4.4, AC-6.1, AC-6.2, AC-6.4] Render the tracer-bullet mark and linked exact table/source fallback in `src/scene/RegressionScene.tsx`, `src/ui/TracerEvidencePanel.tsx`, `src/ui/GeneratedSourceSnippet.tsx`, `src/ui/AuthoredSourceSnippet.tsx`, and `tests/e2e/tracer-bullet.spec.ts` while retaining all existing `ParsedTraceModel`-based views unchanged (implements FR-009, FR-010, FR-011, FR-019, FR-020, FR-022)
- [x] T022 [US1] [TDD: AC-0.2, AC-1.4, AC-0.4] Enforce the first early quality checkpoint in `src/engine/worker/sessionRepository.ts`, `src/engine/engineClient.ts`, `src/ui/ExperimentImport.tsx`, `tests/e2e/import-memory-accessibility.spec.ts`, and `tests/e2e/tracer-startup.spec.ts`: demo-sized 3+3, 4+3, 4+4, and 5+5 cohorts work within T006 aggregate memory; calibrated projected peak bounds observed peak across compressed and uncompressed fixtures; over-budget cohorts reject before materialization; commit/cancel/dispose release every imported/decompressed/text/raw-event/trace_engine intermediate; progress remains accurate; the main thread stays responsive; TraceSession conservation stays green; the tracked demo provisionally parses to a stable workspace within 3 seconds; and import/tracer controls pass keyboard and WCAG 2.2 AA checks (implements NFR-005, NFR-006, NFR-007, NFR-008)

## Phase 4: User Story 2 - Navigate the 3D Workspace Intuitively

**Goal**: Make strategy/map navigation predictable, demand-rendered, keyboard-accessible, and documented on real input devices while preserving evidence state.

**Independent test criteria**:

- AC-2.1 through AC-2.3: Trackpad swipes pan, pinch zooms around focus, and one-pointer drag rotates only in orbit while panning orthographic views.
- AC-2.4 through AC-2.7: Fit/focus/reset and strategy/free transitions preserve evidence, stay bounded, and respect reduced motion.
- AC-0.3 and AC-0.4: Settled scenes render zero idle frames and camera actions remain reachable across the documented device/input matrix.

- [v] T023 [US2] [TDD: AC-2.1, AC-2.2, AC-2.3] Complete screen-space trackpad swipe, pinch-focus, discrete wheel, pointer-drag, and one/two-touch handling in `src/scene/cameraNavigation.ts`, `src/scene/CameraRig.tsx`, `src/scene/cameraNavigation.test.ts`, and `tests/e2e/camera-gestures.spec.ts` (implements FR-012)
- [v] T024 [US2] [TDD: AC-2.4, AC-2.5] Add fit-all, fit-selection, reset-view, focus-next, focus-previous, and bounded orientation aid behavior in `src/scene/cameraActions.ts`, `src/scene/CameraRig.tsx`, `src/scene/Minimap.tsx`, `src/ui/CameraControls.tsx`, and `src/state/store.ts`, driving red-green focus/pose/selection assertions through `src/scene/cameraActions.test.ts` and `tests/e2e/camera-actions.spec.ts` (implements FR-013). Automated framing and real same-stage multi-finding next/previous focus pass; physical/full device-matrix sign-off remains at T059.
- [v] T025 [US2] [TDD: AC-2.6, AC-2.7] Add strategy/free camera switching, serializable camera pose, unchanged `AnalysisScope`/selection, and reduced-motion final-pose behavior in `src/scene/CameraRig.tsx`, `src/scene/GrowIn.tsx`, `src/ui/CameraControls.tsx`, `src/state/store.ts`, and `tests/e2e/camera-modes.spec.ts` (implements FR-014; NFR-008). Strategy/free preservation and reduced-motion same-stage finding changes pass automated checks; physical/full device-matrix sign-off remains at T059.
- [v] T026 [US2] [TDD: AC-0.3, AC-0.4, AC-2.1, AC-2.2, AC-2.7] Switch the 3D stage to demand rendering, invalidate only for active input/required transitions, add keyboard/non-drag camera parity, and record actual Chrome/macOS trackpad plus available touch-device results in `src/App.tsx`, `src/scene/CameraRig.tsx`, `tests/e2e/camera-idle-accessibility.spec.ts`, and `docs/verification/gesture-device-matrix.md` (implements NFR-004, NFR-008, NFR-010). Automated code, Chromium gesture/touch emulation, idle-frame, keyboard, reduced-motion, and 375 px camera checks pass. Physical and full device-matrix sign-off remains explicitly deferred to T059 and is not claimed here.

## Phase 5: User Story 3 - Identify a Regression Beyond Noise

**Goal**: Expand the worker-owned tracer ranking into complete semantic finding classes without moving cohort data or scans to the main thread.

**Independent test criteria**:

- AC-3.1 and AC-3.4: Findings show cohort values, absolute/relative effects, dispersion, samples, completeness, and conservative outlier handling.
- AC-3.2 and AC-3.3: Authored/generated source identities remain distinct and union matching retains added, removed, and unmatched entities.
- AC-3.5 and AC-0.4: Provenance is exact and the ranked-findings workflow passes keyboard, mobile, and WCAG checks.

- [x] T027 [US3] [TDD: AC-3.2, AC-3.3] Expand semantic identity and union matching after T011 for source frames, browser domains, request identities, frame outcomes, and supported metrics in `src/engine/worker/identity.ts`, `src/engine/worker/matching.ts`, and `src/engine/worker/matching.test.ts` (implements FR-006)
- [x] T028 [US3] [TDD: AC-3.1, AC-3.4, AC-1.3] Implement the estimator frozen after T005, absolute/relative effects, run-to-run dispersion, completeness, evidence quality, missingness, and conservative promotion in `src/engine/worker/statistics.ts`, `src/engine/worker/rankFindings.ts`, and `src/engine/worker/rankFindings.test.ts` (implements FR-005, FR-006, FR-007)
- [x] T029 [US3] [TDD: AC-3.5] Expand provenance to every finding class while retaining exact envelope hashes, source mapping state, run/event identities, scope, versions, and parameters in `src/engine/worker/provenance.ts` and `src/engine/worker/provenance.test.ts` (implements FR-008)
- [x] T030 [US3] [TDD: AC-3.1, AC-3.2, AC-3.3, AC-3.4, AC-3.5] Run complete compatibility, matching, statistics, ranking, and provenance scans inside `src/engine/worker/experimentAnalysis.ts` and `src/engine/worker/experimentAnalysis.test.ts`, returning bounded finding summaries/details through `src/engine/protocol.ts` only (implements FR-004, FR-005, FR-006, FR-007, FR-008)
- [x] T031 [US3] [TDD: AC-3.1, AC-3.2, AC-3.3, AC-3.4, AC-3.5] Ship the ranked findings, completeness, evidence-quality, unmatched-state, and provenance inspector in `src/ui/FindingsPanel.tsx`, `src/ui/FindingProvenance.tsx`, `src/state/store.ts`, and `tests/e2e/findings.spec.ts` (implements FR-004, FR-005, FR-006, FR-007, FR-008)
- [x] T032 [US3] [TDD: AC-0.4, AC-4.5] Incrementally migrate `src/scene/DiffScene.tsx` to worker-provided bounded finding projections and stable evidence IDs, and enforce sub-100 ms focus plus keyboard/mobile/WCAG operation in `src/ui/FindingsPanel.tsx` and `tests/e2e/findings-quality.spec.ts`; keep other legacy views on `ParsedTraceModel` (implements FR-003, FR-009; NFR-005, NFR-008, NFR-010)

## Phase 6: User Story 4 - Move from 3D Discovery to Exact Proof

**Goal**: Expand the tracer mark into an invertible 3D regression overview with exact multi-domain two-dimensional evidence and early interaction budgets.

**Independent test criteria**:

- AC-4.1 and AC-4.2: Every 3D finding requests and reveals exact synchronized baseline/candidate contributors.
- AC-4.3 and AC-4.4: CPU, GPU, and network units/scales are explicit; gaps and unsupported joins never become causal edges.
- AC-4.5 and AC-0.4: Stable identities round-trip across views within interaction budgets and with keyboard/mobile/WCAG parity.

- [v] T033 [US4] [TDD: AC-4.1, AC-4.3, AC-4.4] Expand the worker regression projection to bounded CPU, GPU, network, frame, request, metric, and source marks with declared units/scales, explicit gaps, and invertible contributor IDs in `src/engine/worker/regressionProjection.ts` and `src/engine/worker/regressionProjection.test.ts` (implements FR-009, FR-010; NFR-002, NFR-003)
- [v] T034 [US4] [TDD: AC-4.1, AC-4.4] Implement budgeted on-demand exact contributor, timeline, table, screenshot, and provenance slices in `src/engine/worker/evidenceSlice.ts`, `src/evidence/query.ts`, and `src/engine/worker/evidenceSlice.test.ts`; reject over-limit slices with a specific reason rather than truncate (implements FR-010, FR-011)
- [v] T035 [US4] [TDD: AC-4.1, AC-4.3, AC-4.4] Expand `src/scene/RegressionScene.tsx`, `src/scene/regressionPicking.ts`, and `src/App.tsx` into the primary selectable multi-domain stage linked to `AnalysisScope`, without per-event React geometry or fabricated edges, driving red-green mark-selection, unit/scale, and gap assertions through `src/scene/regressionPicking.test.ts` and `tests/e2e/regression-scene.spec.ts` (implements FR-009, FR-010)
- [ ] T036 [US4] [TDD: AC-4.2, AC-4.5] Add synchronized exact baseline/candidate timelines and tables with stable identity round trips in `src/ui/EvidenceRail.tsx`, `src/ui/ExactEvidenceView.tsx`, `src/ui/EvidenceTable.tsx`, `src/state/store.ts`, and `tests/e2e/evidence-roundtrip.spec.ts` (implements FR-010, FR-011)
- [ ] T037 [US4] [TDD: AC-4.5] Incrementally migrate `src/scene/CanyonScene.tsx` and `src/scene/TerrainScene.tsx` to request bounded projections/evidence slices through `src/engine/engineClient.ts`, driving red-green stable-identity round trips through `tests/e2e/projection-migration-canyon-terrain.spec.ts`, while leaving Rhythm, City, and remaining panels on the retained `ParsedTraceModel` projection (implements FR-003, FR-010)
- [ ] T038 [US4] [TDD: AC-0.4, AC-4.1, AC-4.2, AC-4.5] Enforce the second early quality checkpoint in `src/ui/EvidenceRail.tsx`, `src/ui/ExactEvidenceView.tsx`, `src/index.css`, and `tests/e2e/evidence-quality.spec.ts`: pan/zoom/select/reveal p95 stays below 100 ms, evidence slices remain bounded, and 3D-to-2D actions pass keyboard, 375 px, touch, and WCAG 2.2 AA checks (implements NFR-005, NFR-008, NFR-010)

## Phase 7: User Story 5 - Investigate Performance and Web Vitals Outcomes

**Goal**: Derive and present only supported navigation-owned outcomes from worker-held evidence with honest lab/field semantics.

**Independent test criteria**:

- AC-5.1 through AC-5.3: LCP subparts, complete Event Timing/INP, and complete LayoutShift/CLS resolve when supported; otherwise each states why it is unavailable.
- AC-5.4 and AC-5.6: Trace, lab, field, derived, and supporting signals remain distinct and correctly named.
- AC-5.5, AC-0.4, and AC-0.7: Definitions are authoritative and metric workflows remain accessible with specific fail-closed unavailable states.

- [ ] T039 [US5] [TDD: AC-5.1, AC-5.2, AC-5.3, AC-5.6] Resolve navigation-owned LCP phases, FCP, TTFB, DCL, Load, long tasks, long animation frames, dropped frames, requests, CPU/GPU work, memory, User Timing, complete Event Timing/INP, and complete LayoutShift/CLS from T009 inside `src/engine/worker/metrics.ts` and `src/engine/worker/metrics.test.ts` (implements FR-015, FR-016)
- [ ] T040 [US5] [TDD: AC-5.1, AC-5.2, AC-5.3, AC-5.4] Produce worker-side cohort metric findings and explicit trace-observation, lab, field, derived-association, supporting-evidence, and unavailable states in `src/engine/worker/metricFindings.ts` and `src/engine/worker/metricFindings.test.ts` (implements FR-005, FR-006, FR-016, FR-017)
- [ ] T041 [P] [US5] [TDD: AC-5.5] Add a reviewed authoritative definition registry and reusable disclosure links in `src/evidence/definitions.ts`, `src/ui/DefinitionLink.tsx`, and `src/evidence/definitions.test.ts`, preferring current MDN and primary specifications (implements FR-018; NFR-009)
- [ ] T042 [US5] [TDD: AC-5.1, AC-5.2, AC-5.3, AC-5.4, AC-5.5, AC-5.6] Migrate `src/ui/WebVitalsView.tsx` to worker-requested metric findings/evidence slices and ship cohort outcomes, subparts, labels, definitions, and reasons in `src/ui/MetricEvidence.tsx`, `src/App.tsx`, and `tests/e2e/performance-outcomes.spec.ts` (implements FR-015, FR-016, FR-017, FR-018)
- [ ] T043 [US5] [TDD: AC-0.4, AC-0.7] Enforce keyboard/non-drag, 375 px, touch, WCAG 2.2 AA, and fail-closed unsupported-metric behavior in `src/ui/WebVitalsView.tsx`, `src/ui/MetricEvidence.tsx`, `src/index.css`, and `tests/e2e/performance-outcomes-quality.spec.ts` (implements NFR-008, NFR-010)

## Phase 8: User Story 6 - Inspect the Source Code Behind a Finding

**Goal**: Resolve generated, authored, or explicitly granted Chromium workspace source without ambient network/filesystem access and with precise provenance.

**Independent test criteria**:

- AC-6.1, AC-6.2, and AC-6.4: Embedded generated source and valid maps resolve exact positions; malformed, ambiguous, missing, or stale evidence retains fallback coordinates and reasons.
- AC-6.3: Chromium v1 workspace lookup uses explicit File System Access handles and declared roots; other browsers show an explicit unsupported state while embedded source remains usable.
- AC-6.5 and AC-0.4: Source inclusion is previewed before export and source workflows pass keyboard/mobile/WCAG checks.

- [ ] T044 [US6] [TDD: AC-6.1, AC-6.4] Expand and harden T011's minimal generated-snippet resolver across all selected call-frame/resource forms, larger contextual slices, provenance variants, blocked URI cases, aggregate source budgets, and typed failure reasons in `src/engine/worker/generatedSource.ts` and `src/engine/worker/generatedSource.test.ts`, with no URL fetch and T006 limits enforced (implements FR-019, FR-022)
- [ ] T045 [US6] [TDD: AC-6.2, AC-6.4] Expand and harden T011's minimal authored resolver across regular/index maps, hashed assets, inline scripts, missing/malformed/stale maps, ambiguous mappings, blocked URIs, depth/size limits, and multi-finding evidence slices in `src/engine/worker/authoredSource.ts` and `src/engine/worker/authoredSource.test.ts`, always preserving generated fallback (implements FR-020, FR-022)
- [ ] T046 [P] [US6] [TDD: AC-6.3, AC-0.7] Implement Chromium-only v1 local workspace resolution with explicit `FileSystemDirectoryHandle` grants, persisted grant labels but not ambient paths, descendant traversal checks, no `..` escape/symlink-like out-of-root resolution, no implicit fetch, and an explicit non-Chromium unsupported state in `src/source/workspaceAdapter.ts`, `src/ui/WorkspaceGrant.tsx`, and `src/source/workspaceAdapter.test.ts` (implements FR-021, FR-022; NFR-001)
- [ ] T047 [US6] [TDD: AC-6.1, AC-6.2, AC-6.3, AC-6.4, AC-0.4] Ship the read-only source viewer, mapping/provenance states, generated fallback, unavailable/security reasons, Chromium grant flow, and accessible keyboard/mobile layout in `src/ui/SourceEvidence.tsx`, `src/ui/WorkspaceGrant.tsx`, `src/index.css`, and `tests/e2e/source-evidence.spec.ts` (implements FR-019, FR-020, FR-021, FR-022; NFR-008, NFR-010)
- [ ] T048 [US6] [TDD: AC-6.5] Implement source inclusion modes and deterministic preview for content, source maps, hashes-only, or references-only in `src/case/sourcePolicy.ts`, `src/ui/SourceExportPolicy.tsx`, and `src/case/sourcePolicy.test.ts`; policy never bypasses T006/T011/T046 security boundaries (implements FR-022, FR-023)

## Phase 9: User Story 7 - Save and Validate a Performance Conclusion

**Goal**: Export a self-contained, integrity-checked evidence case that restores exact proof without the original traces or worker sessions.

**Independent test criteria**:

- AC-7.1 and AC-7.2: Cases preserve scope, findings, evidence levels, hypotheses, interventions, and before/after validation evidence.
- AC-7.3: JSON and Markdown identify the same deterministic finding, values, provenance, uncertainty, integrity, and source policy.
- AC-7.4 and AC-0.4: A fresh app with no original sessions restores camera, exact 2D/source evidence, and availability states with accessible controls.

- [ ] T049 [US7] [TDD: AC-7.1, AC-7.4] Build a minimal immutable self-contained case bundle from requested worker evidence in `src/engine/worker/caseBundle.ts`, `src/case/schema.ts`, and `src/engine/worker/caseBundle.test.ts`; embed the finding, `AnalysisScope`, derivation versions, camera pose, exact 2D/source evidence slices, availability states, per-slice SHA-256, and whole-bundle integrity hash so restoration requires no TraceSession, while source content remains T048-policy-controlled (implements FR-023, FR-024)
- [ ] T050 [US7] [TDD: AC-7.1] Implement immutable evidence-case drafts, save/update semantics, hypothesis/intervention states, and the case editor in `src/case/evidenceCase.ts`, `src/ui/CasePanel.tsx`, `src/state/store.ts`, and `src/case/evidenceCase.test.ts` (implements FR-023)
- [ ] T051 [US7] [TDD: AC-7.2] Compare follow-up candidate cohorts against recorded predictions and retain before/after evidence during intervention validation in `src/engine/worker/intervention.ts`, `src/ui/InterventionPanel.tsx`, and `src/engine/worker/intervention.test.ts` (implements FR-023)
- [ ] T052 [US7] [TDD: AC-7.3, AC-6.5] Implement canonical deterministic self-contained JSON, issue-ready Markdown, integrity verification, source inclusion preview, and download in `src/case/export.ts`, `src/ui/CaseExport.tsx`, and `src/case/export.test.ts`; document the chosen local case extension without weakening T049 completeness or T048 sensitivity policy (implements FR-023)
- [ ] T053 [US7] [TDD: AC-7.4, AC-0.7] Implement validated case import into a fresh app after disposing all sessions in `src/case/import.ts`, `src/ui/CaseImport.tsx`, `src/state/store.ts`, and `tests/e2e/case-no-trace-roundtrip.spec.ts`; restore finding, scope, camera, exact 2D/source evidence, and availability from embedded slices, and reject integrity failures or undeclared file dependencies (implements FR-024; NFR-001)
- [ ] T054 [US7] [TDD: AC-0.4, AC-7.4] Enforce keyboard/non-drag, 375 px, touch, reduced-motion, and WCAG 2.2 AA operation for save, validate, preview, export, and no-trace restore in `src/ui/CasePanel.tsx`, `src/ui/CaseExport.tsx`, `src/ui/CaseImport.tsx`, `src/index.css`, and `tests/e2e/case-quality.spec.ts` (implements NFR-008, NFR-010)

## Final Phase: Polish

Finish incremental projection migration, final performance/determinism/accessibility checks, benchmark results, disclosures, and repository gates.

- [ ] T055 [TDD: AC-0.1, AC-4.5] Complete expand-contract migration after the tracer bullet by moving `src/scene/RhythmScene.tsx`, `src/scene/CityScene.tsx`, `src/ui/BottomUpTable.tsx`, and `src/ui/HudPanel.tsx` to bounded worker projections/evidence slices, driving red-green deterministic stable-identity behavior through `tests/e2e/projection-migration-remaining.spec.ts`, then remove direct main-thread canonical-model assumptions from `src/engine/types.ts` and `src/state/store.ts` while retaining a named bounded visualization projection (implements FR-003, FR-010, FR-011, FR-025; NFR-002, NFR-003)
- [ ] T056 [TDD: AC-0.2, AC-1.4] Enforce the final tracked-demo 3-second stable-workspace budget, aggregate retained-plus-in-flight peak memory budget, calibrated projected-peak coverage of observed string/JSON.parse/trace_engine/canonicalization amplification, valid 3+3/4+3/4+4/5+5 cohort completion, over-budget rejection before materialization, lifecycle release of imported/compressed/decompressed bytes, decoded text, raw events, and trace_engine structures, worker progress/cancellation/disposal, and post-analysis 100 ms p95 interaction budget in `src/engine/worker/sessionRepository.ts`, `src/engine/worker/jobController.ts`, `src/engine/engineClient.ts`, `src/engine/worker/sessionRepository.test.ts`, and `tests/e2e/performance.spec.ts` (implements NFR-005, NFR-006, NFR-007)
- [ ] T057 [TDD: AC-0.1, AC-0.3] Verify deterministic findings, evidence IDs, projections, camera restoration, and rendered attributes across reloads while preserving zero idle frames in `src/scene/CameraRig.tsx`, `src/engine/worker/projections.ts`, and `tests/e2e/determinism.spec.ts` (implements NFR-003, NFR-004)
- [ ] T058 [TDD: AC-0.5, AC-0.6] Run the T005 preregistered held-out comparison and generate accuracy, top-three/tie outcomes, diagnosis time, unsupported claims, failures, participant/sample size, and superiority gating in `src/benchmark/runBenchmark.ts`, `src/benchmark/report.ts`, `src/ui/BenchmarkDisclosure.tsx`, `src/benchmark/report.test.ts`, and `docs/benchmark-results.md`; ties or lower accuracy prohibit superiority claims
- [ ] T059 [TDD: AC-0.4] Run the integrated per-story WCAG 2.2 AA, keyboard, non-drag, reduced-motion, 375 px, touch, Chromium/non-Chromium, and real-device matrix gate in `tests/e2e/accessibility-responsive.spec.ts`, `docs/verification/gesture-device-matrix.md`, and `docs/verification/accessibility-report.md`, fixing cross-story reachability regressions in `src/App.tsx`, `src/index.css`, and `src/ui/Toolbar.tsx` (implements NFR-008, NFR-010)
- [ ] T060 Align continuous integration, final verification instructions, untrusted-input limits, hash semantics, worker-memory ownership, Chromium-only workspace support, privacy guarantees, benchmark gates, and release boundaries in `.github/workflows/ci.yml`, `.claude/skills/verify/SKILL.md`, and `README.md`

## Dependencies

- Phase 1 blocks Phase 2. Phase 2 blocks every user-story phase.
- T002 depends on: T001.
- T003 depends on: T001.
- T005 depends on: T003.
- T007 depends on: T006.
- T008 depends on: T003, T006, T007.
- T009 depends on: T008.
- T010 depends on: T009.
- T011 depends on: T003, T006, T009.
- T012 depends on: T006, T007, T009.
- T013 depends on: T010, T012.
- T014 depends on: T006.
- Phase 3 depends on: T005, T011, T012, T013, T014.
- T016 depends on: T015.
- T017 depends on: T013, T015, T016.
- T018 depends on: T005, T011, T015, T016.
- T019 depends on: T018.
- T020 depends on: T010, T011, T012, T018, T019.
- T021 depends on: T011, T013, T014, T020.
- T022 depends on: T007, T010, T017, T021.
- Phase 4 depends on: T004, T006, T013, T014. It is independent of Phase 3 and may run beside it in an isolated worktree.
- T024 depends on: T023, T035 for its remaining same-stage multi-finding AC.
- T025 depends on: T024, T035 for its remaining same-stage finding-change AC.
- T026 automated code dependency depends on: T004, T023. Physical and full device-matrix sign-off is retained at T059.
- Phase 5 depends on: T005, T011, T022.
- T028 depends on: T005, T016, T027.
- T029 depends on: T028.
- T030 depends on: T012, T027, T028, T029.
- T031 depends on: T014, T030.
- T032 depends on: T010, T031.
- T033-T035 may start from completed T030-T032 plus automated T026; physical/full device-matrix sign-off remains deferred to T059.
- T034 depends on: T012, T033.
- T035 depends on: T026, T033, T034.
- T036-T038 retain their normal dependency order below.
- T036 depends on: T034, T035.
- T037 depends on: T010, T036.
- T038 depends on: T034, T035, T036, T037.
- Phase 7 depends on: T009, T030, T038.
- T040 depends on: T028, T039.
- T041 depends on: T014.
- T042 depends on: T038, T039, T040, T041.
- T043 depends on: T042.
- Phase 8 depends on: T011, T021, T038. It is independent of Phase 7 and may run beside it in an isolated worktree.
- T045 depends on: T011, T044.
- T046 depends on: T006, T014, T044.
- T047 depends on: T014, T038, T044, T045, T046.
- T048 depends on: T006, T047.
- Phase 9 depends on: T030, T038, T043, T048.
- T049 depends on: T034, T043, T048.
- T050 depends on: T049.
- T051 depends on: T030, T040, T050.
- T052 depends on: T048, T049, T050.
- T053 depends on: T052.
- T054 depends on: T051, T053.
- The Final Phase depends on: T043, T048, T054 and every earlier story task.
- T055 depends on: T010, T032, T037, T042, T047, T054.
- T056 depends on: T022, T038, T043, T054, T055.
- T057 depends on: T026, T055.
- T058 depends on: T005, T054, T056, T057.
- T059 depends on: T022, T026, T032, T038, T043, T047, T054.
- T060 depends on: T055, T056, T057, T058, T059.

## Parallel Opportunities

- T002, T003, and T004 can run together after T001 because browser config, fixture builders, and verification documentation are disjoint.
- T005 can run in an isolated worktree beside T006 through T014, but T018 and T028 are blocked until the preregistration is frozen.
- T014 can run beside T007 through T013 after T006 because presentation primitives do not write worker repository/protocol files.
- Phase 4 can run in an isolated worktree beside Phase 3 after Phase 2. Integrate Phase 3 first so the tracer-bullet checkpoint is preserved before broader view work.
- T041 can run beside T039 and T040 because authoritative definitions do not write worker metric contracts or mutable fixtures.
- Phase 7 and Phase 8 can run in isolated worktrees after Phase 6. Integrate Phase 7 first, then rebase and integrate Phase 8 before Phase 9.
- T045 and T046 can run together after T044 because authored-map and Chromium workspace adapters use separate files and contracts fixed by T006/T011.
- `[P]` is only a scheduling hint. Concurrent writes require isolated worktrees; the pipeline orchestrator owns integration order, conflict resolution, checkpoint gates, and final completion.

## Verification Strategy

- Focused task gate: every TDD-tagged behavior task owns the concrete `.test.ts` or `.spec.ts` path named on its task line; begin with one failing assertion per tagged AC, run that public seam with `pnpm exec vitest run <test-file>` or `pnpm test:e2e -- <spec-file>`, then ESLint changed source/test files.
- Untrusted-ingestion gate after T011: run `src/engine/worker/sessionRepository.test.ts`, `src/engine/worker/fullEnvelope.test.ts`, `src/engine/adapter.test.ts`, `src/engine/worker/conservation.test.ts`, `src/source/sourceIdentity.test.ts`, and `src/engine/worker/tracerSource.test.ts`; verify exact-byte/decompressed hashes, complete envelope metadata, animation-frame evidence, 3-5 by 3-5 cardinality, aggregate retained-plus-in-flight admission, streaming decompression enforcement, measured decode/JSON.parse/trace_engine/canonicalization amplification, post-commit intermediate release, transfer allowlists, fail-closed limits, generated/authored snippet fallback, malformed maps, compression bombs, and zero ambient network requests.
- Tracer-bullet checkpoint after T022: run complete 3+3, 4+3, 4+4, and 5+5 admission/import workflows plus the 3+3 CPU/source-frame proof path; verify worker peak/retained byte accounting, pre-materialization aggregate rejection, commit/cancel/dispose/supersession release points, TraceSession conservation, exact generated/authored/fallback snippets, one-mark 3D-to-2D/source round trip, provisional tracked-demo stable startup under 3 seconds, import/tracer WCAG checks, and a main-thread responsiveness trace before migrating any remaining legacy view.
- Camera checkpoint after T026: prove zero continuous idle frames, keyboard/non-drag parity, reduced motion, and every available real-device row in `docs/verification/gesture-device-matrix.md`; unresolved required rows block Phase 4 completion.
- Finding checkpoint after T032: verify preregistered estimator inputs, authored/generated identity fallback, union matching, provenance hashes, bounded responses, sub-100 ms focus, and Story 3 WCAG/mobile behavior.
- 3D/evidence checkpoint after T038: verify projection conservation, declared units/scales, no fabricated edges, slice rejection rather than truncation, sub-100 ms p95 pan/zoom/select/reveal, and Story 4 keyboard/touch/375 px/WCAG behavior.
- Per-story accessibility gate: before any user-story task becomes `[x]`, run that phase's focused browser workflow for keyboard, non-drag, focus order, names/roles/states, reduced motion where applicable, 375 px reachability, and available touch hardware. Record device-only evidence in `docs/verification/gesture-device-matrix.md`.
- Phase/checkpoint gate: run `pnpm build`, `pnpm lint`, and `pnpm test` after Setup/Foundational, the tracer bullet, camera, findings, 3D/evidence, and every later integrated story phase. Story workers may mark tasks `[v]` but cannot claim the final repository gate.
- EvidenceCase gate after T054: dispose every worker session, disable source workspace access, import the exported case in a fresh page, verify all integrity hashes, and prove finding/scope/camera/exact 2D/source/availability restoration from embedded minimal slices alone.
- Final repository gate: this dependency-ordered pipeline's orchestrator owns the final gate after integrating all worktrees. It runs `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, benchmark protocol/result validation, `.claude/skills/verify/SKILL.md`, browser console/network review, deterministic screenshots, worker memory/disposal observation, performance budgets, the completed real-device matrix, integrated WCAG/mobile checks, and blinded benchmark sign-off.
- A truncation, cohort below 3 or above 5 runs, rejection of a memory-valid 3+3/4+3/4+4/5+5 cohort, aggregate-memory overrun, unreleased ingestion/trace_engine intermediate, leaked complete session/main-thread scan, unexpected fetch, path escape, stale result, unavailable reason omission, hash/integrity mismatch, failed no-trace restore, idle render loop, accessibility blocker, performance-budget miss, or benchmark tie/loss fails its earliest checkpoint and the final gate.

## Implementation Strategy

**Tracer-bullet scope**: Phases 1-2 plus Phase 3 are the first executable cut. They prove worker-owned secure full-envelope admission/import for every memory-valid 3-5 by 3-5 cardinality, use 3+3 for the minimal CPU/source-frame proof path, complete generated and source-map-authored snippet fallback before the phase exits, and deliver one finding, one 3D mark, and exact evidence. `ParsedTraceModel` remains a bounded compatibility projection until T022 passes.

**Release MVP scope**: The approved lower bound still requires all user-story phases plus T055 through T059: strategy navigation, complete supported finding classes, exact 3D/2D/source proof, honest Performance/Web Vitals, a self-contained reproducible case, and a passing preregistered accuracy benchmark.

**Ship order**:

1. Phase 1: Setup
2. Phase 2: Foundational
3. Phase 3: User Story 1 - Import a Controlled Experiment
4. Phase 4: User Story 2 - Navigate the 3D Workspace Intuitively
5. Phase 5: User Story 3 - Identify a Regression Beyond Noise
6. Phase 6: User Story 4 - Move from 3D Discovery to Exact Proof
7. Phase 7: User Story 5 - Investigate Performance and Web Vitals Outcomes
8. Phase 8: User Story 6 - Inspect the Source Code Behind a Finding
9. Phase 9: User Story 7 - Save and Validate a Performance Conclusion
10. Final Phase: Polish

Dependency-ready parallel worktrees may overlap Phase 4 with Phase 3, and Phase 7 with Phase 8, but integration follows the order above and reruns the owning checkpoint.

**Test seams**: `[TDD: ...]` tests target these spec-declared public seams.

- Browser-driven complete workflows through `tests/e2e/*.spec.ts`: import, worker progress/cancellation, hybrid camera gestures, demand rendering, 3D-to-2D/source proof, metric states, no-trace case restore, responsive behavior, keyboard parity, and AC-0.x/AC-1.x through AC-7.x outcomes.
- Experiment Analysis worker interface through `src/engine/worker/*.test.ts`: compatibility, alignment, semantic matching, missingness, statistics, ranking, provenance, bounded responses, cancellation, disposal, and AC-1.x/AC-3.x/AC-5.x without main-thread scans.
- Trace Session query/resolve interface through `src/engine/worker/*.test.ts`, `src/evidence/*.test.ts`, and `src/source/*.test.ts`: full-envelope conservation, stable identities, fail-closed limits, bounded projections, source security, metric availability, and AC-4.x/AC-5.x/AC-6.x.
- Evidence Case import/export interface through `src/case/*.test.ts` and `tests/e2e/case-no-trace-roundtrip.spec.ts`: deterministic self-contained JSON/Markdown, source policy, integrity, and exact restore without original sessions for AC-7.x.
- Blinded benchmark harness through `src/benchmark/*.test.ts`, `benchmarks/preregistration.json`, and `benchmarks/known-regressions/manifest.json`: preregistered held-out scoring and complete disclosure for AC-0.5/AC-0.6.

## Coverage

Every Functional Requirement in the spec is covered by at least one task:

- FR-001 -> T008, T012, T015, T017
- FR-002 -> T015, T017
- FR-003 -> T007, T008, T009, T010, T012, T013, T032, T037, T055
- FR-004 -> T012, T014, T015, T017, T030, T031
- FR-005 -> T018, T028, T030, T031, T040
- FR-006 -> T011, T018, T027, T028, T030, T031, T040
- FR-007 -> T014, T016, T017, T018, T028, T030, T031
- FR-008 -> T006, T008, T009, T010, T013, T019, T029, T031
- FR-009 -> T006, T020, T021, T032, T033, T035
- FR-010 -> T020, T021, T033, T034, T035, T036, T037, T055
- FR-011 -> T020, T021, T034, T036, T055
- FR-012 -> T023
- FR-013 -> T024
- FR-014 -> T025
- FR-015 -> T009, T039, T042
- FR-016 -> T009, T039, T040, T042
- FR-017 -> T006, T014, T040, T042, T050, T051
- FR-018 -> T041, T042
- FR-019 -> T008, T009, T011, T020, T021, T044, T047
- FR-020 -> T009, T011, T020, T021, T045, T047
- FR-021 -> T046, T047
- FR-022 -> T011, T014, T020, T021, T044, T045, T046, T047, T048
- FR-023 -> T048, T049, T050, T051, T052
- FR-024 -> T049, T053, T054
- FR-025 -> T006, T012, T055

Every Acceptance Criterion is proven by at least one TDD-tagged task:

- AC-0.1 -> T008, T009, T010, T013, T055, T057
- AC-0.2 -> T022, T056
- AC-0.3 -> T026, T057
- AC-0.4 -> T022, T026, T032, T038, T043, T047, T054, T059
- AC-0.5 -> T005, T058
- AC-0.6 -> T058
- AC-0.7 -> T007, T008, T012, T014, T043, T046, T053
- AC-1.1 -> T015, T017
- AC-1.2 -> T015, T017
- AC-1.3 -> T016, T017, T028
- AC-1.4 -> T007, T012, T017, T022, T056
- AC-2.1 -> T023, T026
- AC-2.2 -> T023, T026
- AC-2.3 -> T023
- AC-2.4 -> T024
- AC-2.5 -> T024
- AC-2.6 -> T025
- AC-2.7 -> T025, T026
- AC-3.1 -> T018, T028, T030, T031
- AC-3.2 -> T011, T018, T027, T030, T031
- AC-3.3 -> T027, T030, T031
- AC-3.4 -> T018, T028, T030, T031
- AC-3.5 -> T019, T029, T030, T031
- AC-4.1 -> T020, T021, T033, T034, T035, T038
- AC-4.2 -> T020, T021, T036, T038
- AC-4.3 -> T033, T035
- AC-4.4 -> T020, T021, T033, T034, T035
- AC-4.5 -> T032, T036, T037, T038, T055
- AC-5.1 -> T039, T040, T042
- AC-5.2 -> T039, T040, T042
- AC-5.3 -> T039, T040, T042
- AC-5.4 -> T040, T042
- AC-5.5 -> T041, T042
- AC-5.6 -> T039, T042
- AC-6.1 -> T011, T020, T021, T044, T047
- AC-6.2 -> T011, T020, T021, T045, T047
- AC-6.3 -> T046, T047
- AC-6.4 -> T011, T020, T021, T044, T045, T047
- AC-6.5 -> T048, T052
- AC-7.1 -> T049, T050
- AC-7.2 -> T051
- AC-7.3 -> T052
- AC-7.4 -> T049, T053, T054

## Open Questions

These spec questions are converted into explicit preconditions and do not block this plan:

- T005 must select and freeze the numeric benchmark corpus size before T018/T028. Corpus growth after preregistration is a reported protocol revision, not an implicit substitution.
- T052 chooses and documents the local case extension, but T049's minimal self-contained evidence and T048's source-content policy are mandatory regardless of extension or packaging.
- Periodic Jank Fingerprints remain a compatible `AnalysisJob` in T006/T012/T055 and are not productized before the Regression Lab accuracy gate.

## Flags

- Local-workspace source resolution is explicitly Chromium-only for v1 through File System Access handles. Non-Chromium browsers receive an unsupported reason; embedded/generated and mapped trace source remain available.
- The numeric ingestion/retention/transfer limits and calibrated peak-memory amplification in T006/T008 are release safety boundaries. Changes require measured calibration, malicious-fixture updates, and review; implementations must reject rather than truncate or silently evict.
- The tracer bullet is the first implementation checkpoint, not the full release MVP. The approved lower bound still spans all seven stories and the benchmark result gate.
- The blinded participant run remains an external release activity. The plan preregisters it before ranking and makes its results/disclosure final-gate inputs.
- Existing modified worktree files must be extended in place. No task may reset, replace, or discard unrelated user changes.
