# Held-out benchmark corpus

This tracked v1 corpus is frozen at **12 cases** and **72 trace envelopes**. Each case contains three baseline and three candidate runs. The size balances initial benchmark coverage against expert-session fatigue; changing it requires a new corpus version and commitment.

The corpus contains deterministic cases from multiple intervention-target families. Case identifiers, cohort membership, file hashes, and cardinality are public in `index.json`. Known targets, answer labels, perturbation recipes, and per-run generation records are intentionally absent from tracked files.

The benchmark protocol freezes this corpus as `held-out-v1`. Ranking, estimator, and application code may consume neither this index nor its traces for parameter selection. Only the benchmark runner may load these inputs after participant assignments and tool versions are locked.

## Custody and blindness

Ground truth remains in ignored custodian-only state. Ranking and estimator work must use separate tuning data and must not inspect held-out cohort differences before the preregistered benchmark. Application and ranking source must not import the custody state or the tracked commitment.

`../commitments/ground-truth.sha256` contains only the SHA-256 digest of the exact canonical private manifest bytes. A custodian verifies the seal by hashing that canonical manifest and comparing the lowercase hexadecimal digest byte-for-byte. A mismatch invalidates the corpus until custody is restored; it must never be repaired by inferring answers from these traces.

## Inputs

Every listed input is a deterministic gzip-compressed JSON trace envelope derived from `public/demo-trace.json`. Consumers must verify each compressed-file SHA-256 from the index before ingestion, then require a non-empty `traceEvents` array. Cohorts below three valid runs are invalid rather than partially scored.

The 12-case count, three-by-three cohorts, and 72 listed hashes are protocol inputs. Any addition, removal, or replacement requires a new corpus ID, a new private-manifest commitment, and a disclosed protocol revision.
