import type { SessionId } from "../../domain/analysis";
import type { EvidenceAvailability } from "../../domain/evidence";
import { unavailableEvidence } from "../../evidence/availability";
import { ENGINE_LIMITS, hasAggregateMemoryHeadroom } from "../limits";
import type { ParsedTraceModel } from "../types";

export type SessionState =
  | "reserved"
  | "ingesting"
  | "canonicalizing"
  | "ready"
  | "canceled"
  | "disposed";

export interface SessionProgress {
  stage: SessionState;
  completed: number;
  total: number;
  sequence: number;
}

export interface IngestionIntermediates {
  importedBytes: Uint8Array | null;
  decompressedBytes: Uint8Array | null;
  decodedText: string | null;
  rawEvents: unknown[] | null;
  traceEngineData: unknown;
}

export interface CanonicalSessionData {
  importSha256: string;
  payloadSha256: string;
  metadata: Readonly<Record<string, unknown>>;
  settings: Readonly<Record<string, unknown>>;
  evidence: unknown;
  screenshots: readonly unknown[];
  resources: readonly unknown[];
  sourceMaps: readonly unknown[];
  scanIndexes: Readonly<Record<string, unknown>>;
  retainedBytes: number;
  compatibilityProjection?: ParsedTraceModel;
}

export interface SessionSnapshot {
  id: SessionId;
  state: SessionState;
  progress: SessionProgress;
  projectedPeakBytes: number;
  retainedBytes: number;
  hasIntermediates: boolean;
  availability: EvidenceAvailability;
}

export type CanonicalSessionSource = Pick<
  TraceSessionRepository,
  "getCanonicalForWorker"
>;

interface SessionRecord {
  id: SessionId;
  state: SessionState;
  progress: SessionProgress;
  importedBytes: number;
  projectedPeakBytes: number;
  intermediates: IngestionIntermediates | null;
  canonical: CanonicalSessionData | null;
}

export class TraceSessionRepository {
  private readonly sessions = new Map<SessionId, SessionRecord>();

  reserve(
    id: SessionId,
    input: { importedBytes: number; projectedPeakBytes: number },
  ): SessionSnapshot {
    if (this.sessions.has(id)) throw new Error(`Session already exists: ${id}`);
    assertByteCount(input.importedBytes, "imported bytes");
    assertByteCount(input.projectedPeakBytes, "projected peak bytes");
    if (input.importedBytes > ENGINE_LIMITS.importedBytes) {
      throw new Error("Imported byte limit exceeded");
    }
    if (!hasAggregateMemoryHeadroom(this.retainedBytes, this.inFlightBytes + input.projectedPeakBytes)) {
      throw new Error("Aggregate retained and in-flight memory limit exceeded");
    }

    const record: SessionRecord = {
      id,
      state: "reserved",
      progress: {
        stage: "reserved",
        completed: 0,
        total: input.importedBytes,
        sequence: 0,
      },
      importedBytes: input.importedBytes,
      projectedPeakBytes: input.projectedPeakBytes,
      intermediates: null,
      canonical: null,
    };
    this.sessions.set(id, record);
    return snapshot(record);
  }

  beginIngest(id: SessionId): SessionSnapshot {
    const record = this.requireState(id, "reserved");
    transition(record, "ingesting", 0);
    return snapshot(record);
  }

  updateIngestProgress(id: SessionId, completed: number): SessionSnapshot {
    const record = this.requireState(id, "ingesting");
    assertByteCount(completed, "completed ingest bytes");
    if (completed < record.progress.completed || completed > record.progress.total) {
      throw new Error("Ingest progress must be monotonic and within the imported size");
    }
    record.progress = {
      ...record.progress,
      completed,
      sequence: record.progress.sequence + 1,
    };
    return snapshot(record);
  }

  beginCanonicalize(
    id: SessionId,
    intermediates: IngestionIntermediates,
  ): SessionSnapshot {
    const record = this.requireState(id, "ingesting");
    record.intermediates = intermediates;
    transition(record, "canonicalizing", record.progress.total);
    return snapshot(record);
  }

  commit(id: SessionId, canonical: CanonicalSessionData): SessionSnapshot {
    const record = this.requireState(id, "canonicalizing");
    assertByteCount(canonical.retainedBytes, "retained canonical bytes");
    const retainedWithoutCurrent = this.retainedBytes;
    const inFlightWithoutCurrent = this.inFlightBytes - record.projectedPeakBytes;
    if (!hasAggregateMemoryHeadroom(retainedWithoutCurrent + canonical.retainedBytes, inFlightWithoutCurrent)) {
      throw new Error("Aggregate retained and in-flight memory limit exceeded at commit");
    }

    releaseIntermediates(record);
    record.canonical = canonical;
    record.projectedPeakBytes = 0;
    transition(record, "ready", record.progress.total);
    return snapshot(record);
  }

  cancel(id: SessionId): SessionSnapshot {
    const record = this.require(id);
    if (record.state === "ready" || record.state === "disposed") {
      throw new Error(`Cannot cancel ${record.state} session`);
    }
    if (record.state !== "canceled") {
      releaseIntermediates(record);
      record.projectedPeakBytes = 0;
      transition(record, "canceled", record.progress.completed);
    }
    return snapshot(record);
  }

  dispose(id: SessionId): SessionSnapshot {
    const record = this.require(id);
    if (record.state !== "disposed") {
      releaseIntermediates(record);
      record.canonical = null;
      record.projectedPeakBytes = 0;
      transition(record, "disposed", record.progress.completed);
    }
    return snapshot(record);
  }

  admitCohort(
    baselineIds: readonly SessionId[],
    candidateIds: readonly SessionId[],
  ): { baseline: SessionSnapshot[]; candidate: SessionSnapshot[] } {
    assertCohortCardinality("baseline", baselineIds);
    assertCohortCardinality("candidate", candidateIds);
    if (new Set([...baselineIds, ...candidateIds]).size !== baselineIds.length + candidateIds.length) {
      throw new Error("A session cannot appear in both cohorts");
    }
    const ready = (id: SessionId) => snapshot(this.requireState(id, "ready"));
    return { baseline: baselineIds.map(ready), candidate: candidateIds.map(ready) };
  }

  get(id: SessionId): SessionSnapshot {
    return snapshot(this.require(id));
  }

  has(id: SessionId): boolean {
    return this.sessions.has(id);
  }

  getCanonicalForWorker(id: SessionId): CanonicalSessionData {
    const canonical = this.requireState(id, "ready").canonical;
    if (!canonical) throw new Error(`Ready session has no canonical data: ${id}`);
    return canonical;
  }

  get accounting(): { retainedBytes: number; inFlightBytes: number; totalBytes: number } {
    return {
      retainedBytes: this.retainedBytes,
      inFlightBytes: this.inFlightBytes,
      totalBytes: this.retainedBytes + this.inFlightBytes,
    };
  }

  private get retainedBytes(): number {
    let total = 0;
    for (const record of this.sessions.values()) {
      total += record.canonical?.retainedBytes ?? 0;
    }
    return total;
  }

  private get inFlightBytes(): number {
    let total = 0;
    for (const record of this.sessions.values()) total += record.projectedPeakBytes;
    return total;
  }

  private require(id: SessionId): SessionRecord {
    const record = this.sessions.get(id);
    if (!record) throw new Error(`Unknown session: ${id}`);
    return record;
  }

  private requireState(id: SessionId, expected: SessionState): SessionRecord {
    const record = this.require(id);
    if (record.state !== expected) {
      throw new Error(`Cannot transition ${record.state} session; expected ${expected}`);
    }
    return record;
  }
}

function transition(record: SessionRecord, state: SessionState, completed: number): void {
  record.state = state;
  record.progress = {
    stage: state,
    completed,
    total: record.progress.total,
    sequence: record.progress.sequence + 1,
  };
}

function releaseIntermediates(record: SessionRecord): void {
  if (record.intermediates) {
    record.intermediates.importedBytes = null;
    record.intermediates.decompressedBytes = null;
    record.intermediates.decodedText = null;
    record.intermediates.rawEvents = null;
    record.intermediates.traceEngineData = null;
  }
  record.intermediates = null;
}

function snapshot(record: SessionRecord): SessionSnapshot {
  return {
    id: record.id,
    state: record.state,
    progress: { ...record.progress },
    projectedPeakBytes: record.projectedPeakBytes,
    retainedBytes: record.canonical?.retainedBytes ?? 0,
    hasIntermediates: record.intermediates !== null,
    availability: availabilityFor(record.state),
  };
}

function availabilityFor(state: SessionState): EvidenceAvailability {
  if (state === "ready") return { state: "available" };
  if (state === "canceled") {
    return unavailableEvidence("canceled", "Canceled by user");
  }
  return unavailableEvidence(
    "omitted-evidence",
    state === "disposed" ? "Session disposed" : "Session is not ready",
  );
}

function assertByteCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function assertCohortCardinality(label: string, ids: readonly SessionId[]): void {
  if (ids.length < ENGINE_LIMITS.minRunsPerCohort || ids.length > ENGINE_LIMITS.maxRunsPerCohort) {
    throw new Error(`${label} cohort must contain 3 to 5 sessions`);
  }
  if (new Set(ids).size !== ids.length) throw new Error(`${label} cohort contains duplicates`);
}
