# Ingestion Memory Calibration

The worker reserves the projected peak before it decodes JSON. Admission uses the imported and decompressed byte counts plus measured amplification for every overlapping representation. Payload bytes alone are not an admission estimate.

## Frozen Phase 2 Calibration

| Representation | Multiplier | Basis |
| --- | ---: | --- |
| Input chunks plus contiguous input buffer | 2.0 x imported bytes | The streaming collector briefly holds chunks and the joined buffer. |
| Compressed buffer retained during decompression | 1.0 x imported bytes | Gzip input remains live until decompression and exact-byte hashing finish. |
| UTF-8 decoder output | 1.0 x decompressed bytes | Lower bound observed for one-byte JSON fixture content. |
| JavaScript string storage | 2.0 x decompressed bytes | Conservative UTF-16 ceiling for decoded JSON. |
| `JSON.parse` objects and raw events | 4.5 x decompressed bytes | Tracked-demo observed heap growth was 1.55 x; the reservation rounds up for trace-shape variation. |
| trace_engine structures | 7.5 x decompressed bytes | Tracked-demo live trace_engine stage was 6.32 x, rounded upward. |
| Canonicalization overlap | 3.0 x decompressed bytes | The tracked-demo canonicalization increment was 2.27 x, rounded upward. |
| Fixed worker overhead | 16 MiB | Parser/module baseline rounded upward. |

The current coefficients are encoded in `DEFAULT_INGESTION_MEMORY_CALIBRATION` in `src/engine/worker/fullEnvelope.ts`. Any change to a coefficient requires rerunning the deterministic fixture and `public/demo-trace.json`, recording imported bytes and peak heap at each stage, and updating the malicious-input tests.

## Recorded Measurement

Measured at `2026-08-20T04:25:08Z` with Node 24.15.0 using exposed garbage collection before the run and adapter stage callbacks while trace_engine data remained live:

| Corpus | Imported bytes | Events | JSON heap delta | trace_engine live heap delta | Canonicalized heap delta | Canonical serialized bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `public/demo-trace.json` | 9,717,415 | 42,410 | 15,004,816 | 61,394,832 | 83,368,080 | 16,714,028 |
| Deterministic full-envelope fixture | 7,465 | 31 | n/a | n/a | n/a | 10,699 |

The Node heap counter does not include all `Buffer` backing storage and can store one-byte strings compactly. The input-buffer, compressed-buffer, UTF-8, and JavaScript-string factors therefore remain representation ceilings rather than reductions based on the small observed heap deltas. Chromium measurements at the tracer-bullet checkpoint replace these values only when they are larger.

## Admission Formula

For uncompressed input:

```text
fixed + imported * input-buffer + decompressed * (decode + string + JSON/raw + trace_engine + canonical overlap)
```

For gzip input, add `imported * compressed-buffer`. The gzip trailer provides the projected decompressed size before the stream is materialized. Ingestion rejects a stream if its observed decompressed size exceeds that projection or the 768 MiB hard limit.

The repository admits a session only when existing retained canonical bytes plus all reserved in-flight peaks plus the new projection remain at or below 1.5 GiB. It does not evict an existing session to make room.

## Release Points

After canonical commit, the worker clears imported and compressed bytes, decompressed bytes, decoded JSON text, raw event arrays, and trace_engine structures. Only hashes, metadata/settings, canonical evidence, screenshots, resources/source maps, and scan indexes remain retained.

Release checkpoints must be remeasured in Chromium before the tracer-bullet quality gate. Browser measurements supersede Node heap observations when they are larger.
