# Feature Specification: Evidence-First Trace Topography Rebuild

## Status

- Ready for implementation

## Overview

Rebuild Trace Topography into a 3D-first local evidence workbench for proving browser-performance regressions across repeated trace cohorts. The workspace keeps spatial analysis as its primary interaction surface, adopts strategy-game navigation and optional free-camera exploration, and makes every visual finding resolve to quantitative evidence, source code, provenance, and an exportable conclusion.

## Problem Statement

Performance and platform engineers can already inspect single traces deeply in Chrome DevTools. Trace Topography currently offers different visual projections, but most investigations stop at an interesting shape before identifying a defensible contributor, source location, comparison effect, or validated intervention. Camera navigation also fails the expected trackpad interaction model: pinching zooms, but two-finger swipes do not reliably pan.

The first rebuilt release must be measurably more accurate than DevTools at locating known regression culprits from repeated controlled traces. It must not claim advantage merely because it is 3D or visually novel.

## Goals

- Prove performance regressions from at least three baseline and three candidate traces of the same scenario.
- Rank source-attributed changes using absolute effect, relative effect, run-to-run dispersion, evidence quality, and missingness.
- Make the 3D workspace the primary discovery surface while keeping exact 2D tables, timelines, and source evidence available without leaving the finding.
- Provide intuitive hybrid game navigation: strategy/map controls by default and an optional free camera.
- Make Performance and Web Vitals first-class, navigation-owned outcomes with lab/field semantics and explicit unavailable states.
- Show generated or authored source code with provenance when trace resources, source maps, or an explicitly granted local workspace make it available.
- Demonstrate higher correct culprit-localization accuracy than Chrome DevTools on a blinded corpus of known regressions before claiming product superiority.

## Core Requirements

### Functional Requirements

- FR-001: The system MUST import and label a baseline cohort and candidate cohort with at least three traces per cohort.
- FR-002: The system MUST establish one selected scenario phase or navigation for all runs and reject incompatible comparisons rather than silently aligning unrelated work.
- FR-003: The system MUST preserve complete canonical analysis data independently from bounded visual projections.
- FR-004: The system MUST report capture coverage, omissions, environment mismatches, missing source data, and derivation versions before ranking findings.
- FR-005: The system MUST compute cohort findings with absolute baseline/candidate values, absolute delta, relative delta, and run-to-run dispersion.
- FR-006: The system MUST rank findings by semantic source frame, browser domain, request identity, frame outcome, and supported performance metric where evidence exists.
- FR-007: The system MUST treat missing evidence as unknown, never as zero.
- FR-008: The system MUST attach trace hashes, scenario/navigation scope, exact event keys, algorithm parameters, and evidence labels to every finding.
- FR-009: The primary workspace MUST open on a 3D regression overview linked to the selected finding and AnalysisScope.
- FR-010: Every selectable 3D mark MUST reveal its quantitative contributors and open exact 2D evidence without requiring manual time matching.
- FR-011: The workspace MUST provide an exact 2D timeline or evidence table for every finding shown in 3D.
- FR-012: The default camera MUST support strategy/map controls: two-finger trackpad swipe pans in screen space, pinch zooms, mouse wheel zooms, one-finger touch rotates in orbit and pans in orthographic views, and drag controls remain available.
- FR-013: The workspace MUST provide fit-all, fit-selection, reset-view, focus-next, focus-previous, and a minimap or equivalent orientation aid.
- FR-014: The user MUST be able to switch to an optional free camera without changing the selected evidence or AnalysisScope.
- FR-015: The system MUST expose LCP, FCP, DCL, Load, long tasks, long animation frames, dropped frames, requests, CPU work, GPU work, memory samples, and User Timing evidence only when the trace supports them.
- FR-016: The system MUST expose INP and CLS only when their required interaction and layout-shift evidence is complete; otherwise it MUST state why they are unavailable.
- FR-017: The system MUST keep trace observations, lab metrics, field metrics, derived associations, and intervention-validated conclusions visually distinct.
- FR-018: The system MUST show metric definitions and standards links from authoritative MDN, web.dev, Chrome, WHATWG, W3C, or ECMA sources as applicable.
- FR-019: The system MUST resolve selected call frames to generated source code when embedded trace resources are available.
- FR-020: The system MUST resolve authored source through source maps when available and retain a generated-source fallback.
- FR-021: The system MUST support explicitly granted local workspace source resolution without ambient filesystem access or implicit network fetching.
- FR-022: Every source snippet MUST show content provenance, generated/authored position, mapping state, trace evidence, and unavailability reason when content cannot be resolved.
- FR-023: The user MUST be able to save a finding with its scope, evidence, hypothesis, and intervention status and export deterministic JSON plus issue-ready Markdown.
- FR-024: A recipient MUST be able to reopen an exported local case and inspect the same finding without reconstructing camera or filter state manually.
- FR-025: The system MUST retain periodicity detection as the next supported job through the same AnalysisScope and finding interfaces, without making it the first-release completion gate.

### Non-Functional Requirements

- NFR-001: Parsing and analysis MUST remain local by default; no trace, source, or source map leaves the machine without explicit user action.
- NFR-002: The canonical analysis model MUST not lose evidence because a rendering lane, label, or instance cap was reached.
- NFR-003: Rendering MUST remain deterministic for identical traces, settings, and camera state.
- NFR-004: Static scenes MUST render on demand with zero continuous idle frames.
- NFR-005: Pan, zoom, selection, and evidence reveal interactions MUST respond within 100 ms at p95 after initial analysis on the tracked demo trace.
- NFR-006: The tracked demo trace MUST parse and reach a stable initial workspace within 3 seconds on the existing reference development machine.
- NFR-007: A six-run cohort of demo-sized traces MUST expose progress, remain cancelable, and complete without freezing the interface or leaking superseded work.
- NFR-008: Every user-visible analytical action MUST have keyboard and non-drag parity; reduced-motion preference MUST disable non-essential camera flights and entrances.
- NFR-009: User-facing web-platform and metric definitions MUST link to authoritative online references, preferring MDN for Web APIs and primary specifications for normative behavior.
- NFR-010: The application MUST remain functional on desktop and touch devices; mobile layouts MUST not hide core navigation, findings, or evidence actions.

## Proposed Approach

The rebuilt product is organized around a complete Trace Session, a shared AnalysisScope, versioned Findings, and bounded visual projections.

1. A Trace Session preserves complete trace, navigation, process, frame, request, source, interaction, metric, and provenance evidence. Visual caps affect only projections.
2. An Experiment Analysis module accepts a baseline/candidate manifest, validates compatibility, aligns one selected scenario phase, computes cohort statistics, and returns versioned Findings.
3. AnalysisScope owns trace cohort, selected scenario/navigation, time window, domain filters, selected finding, and evidence selection. Every view and panel consumes it.
4. The 3D regression overview is the primary stage. It reveals broad changes by time, lane, and magnitude, but each mark is invertible to exact contributors and synchronized 2D evidence.
5. A Source Evidence module resolves generated and authored code through trace-embedded resources, source maps, or an explicitly granted workspace and reports provenance or unavailability.
6. An Evidence Case captures findings, hypotheses, intervention state, scope, derivation versions, and export policy for deterministic JSON and Markdown handoff.
7. Periodic Jank Fingerprints use the same interfaces after the Regression Lab vertical slice is proven.

## User Stories

### Story 1: Import a Controlled Experiment

**As a** performance engineer
**I want to** load repeated baseline and candidate traces for the same scenario
**So that** the system can distinguish a stable regression from one noisy difference

**Acceptance Criteria:**

- [ ] AC-1.1: Given at least three baseline and three candidate traces with the same selected scenario marker, when the user creates an experiment, then all runs are labeled, scoped, and ready for cohort analysis.
  - Pass when: six traces share the selected marker and compatible capture context.
  - Fail when: either cohort has fewer than three runs; the UI blocks regression analysis and explains the minimum.
- [ ] AC-1.2: Given traces with incompatible scenario markers, browser context, throttling, or navigation ownership, when the user starts analysis, then the system reports each incompatibility and does not produce a regression ranking.
  - Pass when: differences explicitly marked acceptable by the user remain visible in the experiment manifest.
  - Fail when: unrelated navigations would otherwise be aligned by timestamp alone.
- [ ] AC-1.3: Given missing data in one or more runs, when cohort statistics are calculated, then the affected measure is marked unknown or incomplete instead of contributing zero.
- [ ] AC-1.4: Given a large multi-run import, when parsing is active, then the user sees per-run progress and can cancel without stale results replacing a newer experiment.

### Story 2: Navigate the 3D Workspace Intuitively

**As a** user exploring a regression landscape
**I want to** navigate it with familiar map and game controls
**So that** camera mechanics never block analysis

**Acceptance Criteria:**

- [ ] AC-2.1: Given a trackpad over the 3D stage, when the user swipes with two fingers left, right, up, or down, then the camera and target pan in the corresponding screen-space direction without zooming.
  - Pass when: horizontal and vertical trackpad deltas move the visible world while preserving camera distance or orthographic zoom.
  - Fail when: the gesture only changes zoom, rotates the camera, or leaves the scene stationary.
- [ ] AC-2.2: Given a trackpad or touchscreen, when the user pinches, then the workspace zooms around the gesture focus without panning unexpectedly.
- [ ] AC-2.3: Given orbit mode, when the user drags with one pointer, then the camera rotates; given top or side orthographic mode, the same drag pans.
- [ ] AC-2.4: Given any camera mode, when the user invokes fit-all, fit-selection, or reset, then the selected evidence remains selected and the camera reaches a stable, bounded pose.
- [ ] AC-2.5: Given multiple findings, when the user invokes next or previous finding, then the workspace focuses the corresponding evidence without requiring manual camera travel.
- [ ] AC-2.6: Given the strategy camera is active, when the user enables free camera and later returns, then AnalysisScope and selected evidence are unchanged.
- [ ] AC-2.7: Given reduced-motion preference, when views or findings change, then the final camera state updates without non-essential cinematic flight.

### Story 3: Identify a Regression Beyond Noise

**As a** performance engineer
**I want to** see ranked changes across trace cohorts
**So that** I can focus on effects that are larger than ordinary run-to-run variation

**Acceptance Criteria:**

- [ ] AC-3.1: Given compatible baseline and candidate cohorts, when analysis completes, then each finding shows baseline value, candidate value, absolute delta, relative delta, dispersion, sample count, and evidence completeness.
- [ ] AC-3.2: Given a source frame whose candidate self time increased consistently, when findings are ranked, then the source frame appears independently from same-named functions in other files.
- [ ] AC-3.3: Given an added, removed, or unmatched lane/request/source entity, when comparing cohorts, then it remains visible as added, removed, or unmatched rather than disappearing from an intersection.
- [ ] AC-3.4: Given one noisy outlier with otherwise overlapping cohorts, when findings are ranked, then the UI does not label the measure a proven regression and exposes the dispersion that prevented promotion.
- [ ] AC-3.5: Given a selected finding, when the user inspects provenance, then exact run IDs, trace hashes, scenario scope, event keys, algorithm version, and parameters are visible.

### Story 4: Move from 3D Discovery to Exact Proof

**As a** user investigating a ranked finding
**I want to** move directly from its 3D mark to exact events and quantitative evidence
**So that** the spatial view produces a defensible conclusion

**Acceptance Criteria:**

- [ ] AC-4.1: Given a selectable 3D mark, when the user selects it, then the evidence rail lists the exact baseline and candidate contributors, values, units, and evidence labels.
- [ ] AC-4.2: Given a selected finding, when the user opens exact evidence, then synchronized baseline and candidate 2D timelines or tables show the same scenario window and selected contributors.
- [ ] AC-4.3: Given CPU, GPU, and network evidence, when they appear together, then each uses a declared domain-specific unit and scale; no shared “busy” height implies false comparability.
- [ ] AC-4.4: Given a missing contributor or unsupported join, when the finding is rendered, then the gap is labeled and no visual edge bridges it as if it were observed causality.
- [ ] AC-4.5: Given a selected long task, request, dropped frame, metric event, or source frame, when the user switches between 3D and 2D evidence, then selection round-trips to the same stable evidence identity.

### Story 5: Investigate Performance and Web Vitals Outcomes

**As a** performance engineer
**I want to** compare user-visible outcomes and their supporting evidence across builds
**So that** metric regressions connect to exact changed work

**Acceptance Criteria:**

- [ ] AC-5.1: Given navigation-owned LCP evidence in all runs, when the user selects LCP, then the system compares the cohort metric and available candidate, request-discovery, network, main-thread, render, and presentation subparts with provenance.
- [ ] AC-5.2: Given complete Event Timing evidence, when the user selects an interaction, then input delay, processing time, presentation delay, interaction target, and supporting event/frame evidence are shown; otherwise INP is explicitly unavailable.
- [ ] AC-5.3: Given complete LayoutShift evidence, when the user selects CLS, then clusters, scores, shifted-node attribution, and recent-input exclusions are shown; otherwise CLS is explicitly unavailable.
- [ ] AC-5.4: Given a trace-only metric observation, when it is displayed, then it is labeled lab trace evidence and never presented as field percentile data.
- [ ] AC-5.5: Given any metric or standardized Web API term in the UI, when the user opens its definition, then an authoritative MDN, web.dev, Chrome, or primary specification link is available.
- [ ] AC-5.6: Given a supporting signal such as FCP, TTFB, DCL, Load, long task, long animation frame, dropped frame, or User Timing measure, when it contributes to a finding, then it remains evidence and is not mislabeled as a Core Web Vital.

### Story 6: Inspect the Source Code Behind a Finding

**As a** feature owner receiving a performance finding
**I want to** inspect the relevant generated or authored code
**So that** I can act without manually locating a URL and line number

**Acceptance Criteria:**

- [ ] AC-6.1: Given embedded resource content for a selected call frame, when the user opens source evidence, then a read-only snippet highlights the exact generated line and column with nearby context.
- [ ] AC-6.2: Given a valid source map with original content, when the user chooses authored source, then the mapped file, function, line, column, and snippet appear with generated-source fallback.
  - Pass when: a regular or index source map resolves a known generated position.
  - Fail when: a malformed or stale map cannot resolve the position; the UI reports the failure and retains generated evidence.
- [ ] AC-6.3: Given no embedded source content, when the user explicitly grants a local workspace, then only declared roots are searched and the resolved snippet states workspace provenance.
- [ ] AC-6.4: Given no permitted source adapter can resolve content, when source evidence opens, then the exact URL/position and a specific unavailable reason remain visible.
- [ ] AC-6.5: Given an exported evidence case, when source inclusion is configured, then the export preview states whether it contains source content, source maps, hashes only, or references only.

### Story 7: Save and Validate a Performance Conclusion

**As a** performance specialist
**I want to** preserve findings and validate them against an intervention
**So that** a recipient gets a reproducible argument rather than a screenshot

**Acceptance Criteria:**

- [ ] AC-7.1: Given a selected finding, when the user saves it, then the case records scope, cohort values, evidence references, evidence level, hypothesis, and intervention status.
- [ ] AC-7.2: Given a follow-up candidate cohort after an intervention, when the predicted evidence and metric change occur, then the finding can be promoted to intervention-validated while retaining before/after evidence.
- [ ] AC-7.3: Given an evidence case, when the user exports JSON and Markdown, then both formats identify the same finding, values, provenance, uncertainty, and source references deterministically.
- [ ] AC-7.4: Given a recipient opens the local case, then the same finding, AnalysisScope, camera focus, 2D evidence, and source evidence are restored without access to undeclared local files.

## Technical Constraints

- The application remains Vite, React 19, TypeScript, react-three-fiber, Zustand, and `@paulirish/trace_engine` unless a separate approved architectural decision changes the stack.
- Trace parsing and canonicalization stay in the Web Worker; trace_engine parse requests remain serialized.
- Trace-engine timestamps convert from microseconds to model-relative milliseconds only at the adapter seam.
- The complete canonical model is UI-free and does not import React or Three.js.
- Per-event geometry does not enter the React tree; large surfaces remain instanced or batched.
- Rendering remains deterministic; no random or time-seeded visual attributes.
- Existing validated color semantics remain the source of truth; new status and metric colors require contrast and color-vision checks.
- Source content and source maps are sensitive local data. No implicit network retrieval or upload is permitted.
- Web-platform behavior and metric definitions use current MDN, web.dev, Chrome, WHATWG, W3C, or ECMA references rather than undocumented assumptions.

## Scope Boundaries

### What This Is NOT

- A replacement for Chrome DevTools capture, Sources, Network, Memory, Lighthouse, or live-page debugging.
- A generic AI chat interface over one trace.
- A hosted trace repository, team account system, or cloud collaboration service.
- A universal Perfetto/system-trace viewer.
- A VR or first-person game experience.
- A claim that one A/B pair proves a regression.
- A field Web Vitals dashboard or CrUX replacement.
- Automatic code modification from trace evidence.
- Full periodic-jank productization in the first release; only shared interfaces and future compatibility are required.

### Path Boundaries

- **Upper bound (do not exceed)**: A local 3D-first Regression Lab for repeated Chrome performance traces, exact linked evidence, Performance/Web Vitals outcomes, source-code resolution, intervention validation, and local case export. Do not add hosted storage, generic AI, live capture, broad DevTools panel cloning, or unrelated trace formats.
- **Lower bound (must at least)**: Fix strategy/map navigation; analyze 3+3 compatible trace cohorts; rank source-attributed findings with dispersion; select a 3D finding and reveal synchronized exact 2D/source evidence; compare supported Web Vitals honestly; export one reproducible finding; pass the accuracy benchmark.
- **Allowed choices**: Exact visual composition, statistical estimator, minimap implementation, evidence-rail layout, local case file extension, source-viewer rendering library, and whether free camera is a mode or temporary modifier, provided all acceptance criteria and constraints hold.
- **Prohibited**: Silent timestamp-only alignment; intersection-only comparison; mixed CPU/GPU/network units; visual caps that delete canonical evidence; fabricated causal edges; implicit source/network access; decorative motion without reduced-motion handling; claims of superiority without benchmark evidence.

### Assumptions

- Target users can provide at least three comparable baseline and three candidate traces for one scenario.
- Historical or seeded regressions with known intervention targets can be assembled for blinded validation.
- Saved Chrome traces may include resource content and source maps, but the product handles their absence explicitly.
- The existing 3D views contain reusable rendering foundations, but their current semantics and UI may be replaced where they conflict with this spec.

## Critical Review

### Why This Approach

- Repeated-run regression proof is a structural gap in DevTools rather than a feature-parity race.
- A shared AnalysisScope and versioned Findings turn the existing views into linked instruments instead of independent destinations.
- 3D remains primary as requested, but exact 2D and source evidence prevent spatial interpretation from becoming the conclusion.
- Strategy-game navigation offers direct manipulation, orientation, focus, and semantic zoom without adopting first-person interaction costs.
- Accuracy-first validation prevents the team from declaring improvement based on aesthetics or subjective novelty.

### Weak Spots / Trade-offs

- Requiring 3+3 traces raises capture cost and may limit the initial audience.
- Cohort compatibility and semantic cross-run identity are harder than visual subtraction.
- 3D-first design creates accessibility and precision obligations that a 2D-first product would avoid.
- Source-map and embedded-resource support increases memory, privacy, and malformed-input risk.
- A blinded DevTools benchmark requires a carefully curated corpus and expert participants.
- Constraint-path or causal claims remain deferred until typed evidence edges and intervention validation are sufficiently complete.

## Alternatives Considered

### Broad Single-Trace DevTools Replacement

- **Description**: Complete LCP, INP, CLS, network, frame, memory, flame-chart, search, annotation, and source parity around the 3D views.
- **Why rejected**: Chrome owns capture, exact source integration, live field metrics, Insights, annotations, and AI; this creates permanent catch-up without a durable information advantage.

### Periodic Jank as the First Release

- **Description**: Productize Rhythm with period detection, occurrence clustering, and common source stacks before comparison.
- **Why rejected**: It remains the second-best wedge, but the user confirmed repeated 3+3 trace cohorts are available and chose regression proof as the primary job.

### 2D-First Analytical Shell

- **Description**: Make a conventional timeline and tables primary, with 3D optional.
- **Why rejected**: This would reduce interaction risk but contradicts the chosen 3D-first product direction. Exact 2D proof remains mandatory inside the 3D-first workspace.

### Free-Fly Game Navigation

- **Description**: Use first-person movement and unrestricted camera controls as the default.
- **Why rejected**: It increases occlusion, disorientation, input complexity, and accessibility cost without improving evidence quality. Free camera remains optional.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Trace cohorts are not comparable | High | High | Require explicit scenario/capture compatibility and block rankings on unresolved mismatches. |
| Statistical output creates false certainty | Medium | High | Show absolute values, dispersion, completeness, evidence labels, and intervention state; never use “root cause” by default. |
| 3D hides quantitative differences | High | High | Every mark is invertible to exact contributors and synchronized 2D proof. |
| Camera controls remain platform-dependent | Medium | High | Browser-level gesture tests cover trackpad wheel/pinch and touchscreen pointer paths across perspective and orthographic cameras. |
| Visual caps truncate evidence | High | High | Separate complete Trace Session from bounded Visualization Model and test conservation. |
| Source content exposes sensitive data | Medium | High | Local-only adapters, explicit grants, export preview, provenance, and fail-closed retrieval. |
| Source maps are stale or malformed | High | Medium | Keep generated fallback, validate mappings, expose mapping provenance and failures. |
| Six traces exhaust memory | Medium | High | Worker progress/cancellation, release superseded models, bounded projections, and memory budgets in verification. |
| Benchmark favors this product unfairly | Medium | High | Pre-register cases, known ground truth, blinded tool order, equal training, and publish failures. |
| Scope expands into every DevTools feature | High | High | Enforce upper bound and reject parity work without direct support for the primary regression job. |

## Acceptance Criteria

- [ ] AC-0.1: Given the same traces, experiment manifest, settings, and camera pose, when analysis and rendering settle, then findings, evidence IDs, and rendered attributes are deterministic.
- [ ] AC-0.2: Given the tracked demo trace, when the app loads on the reference machine, then parsing and the stable initial workspace complete within 3 seconds.
- [ ] AC-0.3: Given a settled static workspace, when the user is idle, then no continuous render loop consumes frames.
- [ ] AC-0.4: Given common desktop, trackpad, touchscreen, keyboard-only, reduced-motion, and 375 px mobile environments, when the user performs core import, navigation, finding selection, evidence reveal, and export actions, then no required control or evidence is unreachable.
- [ ] AC-0.5: Given the blinded known-regression benchmark, when experts use Trace Topography and Chrome DevTools under equal preparation, then Trace Topography identifies the known intervention target in the top three more often; a tie or lower accuracy fails the superiority gate.
- [ ] AC-0.6: Given the benchmark results, when the product reports them, then diagnosis time, accuracy, unsupported claims, failures, and sample size are all disclosed even though accuracy is the release priority.
- [ ] AC-0.7: Given any unsupported metric, unavailable source, omitted evidence, incompatible run, or canceled analysis, when the user encounters it, then the interface provides a specific reason and no stale or fabricated result remains visible.

## Test Seams

- **Browser-driven complete workflows through the running application**: verifies import, hybrid camera gestures, 3D-to-2D evidence, source viewing, Performance/Web Vitals states, case restore/export, responsive behavior, keyboard parity, and AC-0.x/AC-1.x through AC-7.x user outcomes.
- **Experiment Analysis public interface with synthetic and real trace cohorts**: verifies compatibility, alignment, semantic matching, missingness, statistics, ranking, provenance, and AC-1.x/AC-3.x/AC-5.x without coupling tests to internal algorithms.
- **Trace Session query/resolve interface**: verifies complete canonical evidence, stable identities, bounded visual projections, source evidence, metric availability, and AC-4.x/AC-5.x/AC-6.x.
- **Evidence Case import/export interface**: verifies deterministic JSON/Markdown, source inclusion policy, restore behavior, and AC-7.x.
- **Blinded benchmark harness**: verifies AC-0.5 and AC-0.6 against fixed known-regression cases and the documented DevTools procedure.

## Open Questions

- The exact benchmark corpus size may grow beyond the minimum required to establish a stable accuracy comparison.
- The case file extension and whether traces are embedded or referenced may vary by export size and sensitivity policy.
- Periodic Jank Fingerprints can enter the release only if it does not delay the Regression Lab accuracy gate.

## Blockers

None. This spec is ready for implementation.
