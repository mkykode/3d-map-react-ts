# Blinded Accuracy Benchmark Protocol

## Release Gate

Trace Topography may claim higher culprit-localization accuracy than Chrome DevTools only when its preregistered top-three accuracy is strictly greater. Equal or lower accuracy fails the gate. Diagnosis time, unsupported claims, failures, sample size, and exclusions remain mandatory disclosures but do not replace the primary accuracy outcome.

The protocol becomes frozen when the orchestrator creates the reviewed phase-boundary commit containing all protocol artifacts. Any later change requires a new protocol ID, corpus version, ground-truth commitment, and explicit revision disclosure.

## Frozen Inputs

- Protocol: `trace-topography-benchmark-v1`
- Held-out corpus: `held-out-v1`
- Cases: 12
- Trace envelopes: 72
- Cohorts: three baseline and three candidate runs per case
- Estimator: `median-mad-v1`
- Primary outcome: known intervention target appears in the top three

`benchmarks/held-out/index.json` exposes only case IDs, cohort membership, compressed byte lengths, run IDs, and exact SHA-256 hashes. Every input hash must match before a case begins. A missing, corrupt, or under-cardinality cohort invalidates that case before scoring; it is never partially analyzed.

The published commitment is a SHA-256 digest of the custodian's canonical private manifest. Private labels stay outside tracked application and ranking inputs. The custodian opens them only after all participant submissions and tool outputs are locked. A commitment mismatch invalidates the benchmark and cannot be repaired by inferring targets from traces.

## Semantic Target

Each case has one actionable intervention target represented by a canonical semantic target ID. Authored source identity is preferred, with generated source fallback. Browser domains, request identities, frame outcomes, and supported metric entities are valid when they are the sealed intervention granularity. A parent, child, or same-named entity receives no credit unless its alias was sealed before the protocol freeze.

## Estimator Policy

The ranking estimator is fixed before held-out work:

- Cohort location is the median.
- Dispersion is median absolute deviation scaled by 1.4826; the pooled value is the larger cohort dispersion.
- Absolute effect is candidate median minus baseline median.
- Relative effect divides by the larger of the absolute baseline and the unit floor.
- Missing evidence is excluded and reported, never converted to zero.
- Promotion requires three valid runs per cohort, a positive effect, an effect over twice pooled dispersion, and complete semantic identity.
- Ranking score combines positive effect over dispersion, completeness, and the frozen evidence-quality weight.

No empirical tuning cases exist in `tuning-v1`. Only synthetic conformance and determinism tests are permitted. Held-out inputs, labels, benchmark outcomes, and post-freeze observations cannot select parameters. Adding public tuning or known-regression cases requires a versioned protocol revision.

## Top-Three Scoring

Each tool produces unique semantic targets ordered by ranking score. Exact score ties use target ID in ASCII ascending order. The list has exactly three slots; a tie at the cutoff does not create extra positions.

A case is correct when the sealed target or a sealed pre-freeze alias appears at rank 1, 2, or 3. Tool crashes, timeouts, unsupported claims, and empty diagnoses count as incorrect. Trace Topography passes only when both its correct count and accuracy exceed DevTools under equal exposure. A tie or loss fails.

## Participants and Assignment

At least eight eligible experts participate. Each must have at least two years of browser-performance diagnosis experience, recent monthly Chrome Performance panel use, no Trace Topography contribution role, no custody role, and no prior access to held-out labels or recipes.

Each participant receives 20 minutes of scripted training and separate non-held-out practice for each tool, with the same comprehension threshold. A balanced incomplete-block assignment gives each participant six cases per tool without showing the same case in both tools. Tool block order is balanced and randomized. Each case receives at least four exposures per tool. The custodian records the assignment seed before the first scored session.

## Exclusions and Failures

Only preregistered eligibility, consent, training, prior-access, or pre-case integrity failures exclude data. Completed cases remain if a participant withdraws. Replacement participants restore planned coverage without outcome-based selection. Technical failures are recorded and scored incorrect rather than silently excluded.

## Required Results

The result artifact follows `BenchmarkResultRecord` in `src/benchmark/protocol.ts` and reports:

- Protocol, corpus, and commitment identity
- Participant, exclusion, and equal-exposure counts
- Correct counts, accuracy, absolute accuracy delta, and superiority gate
- Median diagnosis time by tool
- Unsupported-claim and failure counts by tool
- Every exclusion code and count

The blinded participant run remains a later release activity. T005 freezes how it will be run and scored; it does not claim a benchmark result.
