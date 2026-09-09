import type {
  AnalysisJob,
  AnalysisJobId,
  AnalysisScope,
  Finding,
  SessionId,
} from "../domain/analysis";
import type { EvidenceIdentity, EvidenceSlice } from "../domain/evidence";
import type { EvidenceSliceQuery } from "../evidence/query";
import type { ParsedTraceModel } from "./types";
import type { TraceOverview, TraceWindow } from "./ingest/types";
import type {
  ExperimentManifest,
  ExperimentManifestInput,
} from "./experimentContract";
import type {
  FindingDetail,
  FindingProjection,
  RegressionProjection,
} from "./findingContract";

export interface SessionManifest {
  version: 1;
  id: SessionId;
  state: "reserved" | "ingesting" | "canonicalizing" | "ready";
  importSha256?: string;
  payloadSha256?: string;
  retainedBytes: number;
  eventCount?: number;
  resourceCount?: number;
  sourceMapCount?: number;
  metadata?: Readonly<Record<string, unknown>>;
  settings?: Readonly<Record<string, unknown>>;
}

export type WorkerRequest =
  | { id: number; type: "scan-trace"; file: File; slot: "primary" | "secondary" }
  | {
      id: number;
      type: "reserve-session";
      sessionId: SessionId;
      importedBytes: number;
      compressed: boolean;
      projectedPeakBytes: number;
    }
  | { id: number; type: "ingest-file"; sessionId: SessionId; file: File }
  | { id: number; type: "ingest-url"; sessionId: SessionId; url: string }
  | {
      id: number;
      type: "load-compatibility-file";
      sessionId: SessionId;
      slot: "primary" | "secondary";
      file: File;
      optimized?: boolean;
      window?: TraceWindow;
    }
  | {
      id: number;
      type: "load-compatibility-url";
      sessionId: SessionId;
      slot: "primary" | "secondary";
      url: string;
    }
  | { id: number; type: "start-job"; job: AnalysisJob }
  | { id: number; type: "create-experiment"; input: ExperimentManifestInput }
  | {
      id: number;
      type: "request-regression-projection";
      scope: AnalysisScope;
    }
  | {
      id: number;
      type: "request-tracer-evidence";
      scope: AnalysisScope;
      findingId: Finding["id"];
      evidenceId: EvidenceIdentity;
    }
  | {
      id: number;
      type: "request-finding-evidence";
      scope: AnalysisScope;
      query: EvidenceSliceQuery;
    }
  | {
      id: number;
      type: "request-finding-detail";
      scope: AnalysisScope;
      findingId: Finding["id"];
    }
  | {
      id: number;
      type: "request-finding-projection";
      scope: AnalysisScope;
    }
  | {
      id: number;
      type: "request-projection";
      sessionId: SessionId;
      scope: AnalysisScope;
    }
  | {
      id: number;
      type: "request-evidence-slice";
      sessionId: SessionId;
      evidenceId: EvidenceIdentity;
      eventKey: string;
    }
  | { id: number; type: "cancel-job"; jobId: AnalysisJobId }
  | { id: number; type: "dispose-session"; sessionId: SessionId };

export type WorkerResponse =
  | { id: number; type: "trace-overview"; overview: TraceOverview }
  | {
      id: number;
      type: "progress";
      jobId: AnalysisJobId;
      completed: number;
      total: number;
      stage: string;
    }
  | { id: number; type: "session-manifest"; manifest: SessionManifest }
  | { id: number; type: "experiment-manifest"; manifest: ExperimentManifest }
  | {
      id: number;
      type: "loaded-compatibility-projection";
      manifest: SessionManifest;
      projection: ParsedTraceModel;
    }
  | {
      id: number;
      type: "findings";
      compatibility: { state: "ready"; issues: ExperimentManifest["issues"] };
      findings: readonly Finding[];
      byteLength: number;
    }
  | { id: number; type: "finding-detail"; detail: FindingDetail }
  | { id: number; type: "finding-projection"; projection: FindingProjection }
  | {
      id: number;
      type: "regression-projection";
      projection: RegressionProjection;
    }
  | { id: number; type: "projection"; projection: ParsedTraceModel }
  | { id: number; type: "evidence-slice"; slice: EvidenceSlice }
  | { id: number; type: "canceled"; jobId: AnalysisJobId }
  | { id: number; type: "disposed"; sessionId: SessionId }
  | {
      id: number;
      type: "error";
      code:
        | "invalid-request"
        | "not-found"
        | "incompatible"
        | "canceled"
        | "unsupported"
        | "security-limit"
        | "internal";
      message: string;
    };

export const TRANSFER_RESPONSE_TYPES = [
  "trace-overview",
  "session-manifest",
  "experiment-manifest",
  "loaded-compatibility-projection",
  "findings",
  "finding-detail",
  "finding-projection",
  "regression-projection",
  "projection",
  "evidence-slice",
  "progress",
  "canceled",
  "disposed",
  "error",
] as const satisfies readonly WorkerResponse["type"][];

export type TransferResponseType = (typeof TRANSFER_RESPONSE_TYPES)[number];

export function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (!isRecord(value) || typeof value.id !== "number" || typeof value.type !== "string") {
    return false;
  }
  return (TRANSFER_RESPONSE_TYPES as readonly string[]).includes(value.type);
}

const RESPONSE_KEYS: Record<WorkerResponse["type"], readonly string[]> = {
  "trace-overview": ["id", "type", "overview"],
  progress: ["id", "type", "jobId", "completed", "total", "stage"],
  "session-manifest": ["id", "type", "manifest"],
  "experiment-manifest": ["id", "type", "manifest"],
  "loaded-compatibility-projection": ["id", "type", "manifest", "projection"],
  findings: ["id", "type", "compatibility", "findings", "byteLength"],
  "finding-detail": ["id", "type", "detail"],
  "finding-projection": ["id", "type", "projection"],
  "regression-projection": ["id", "type", "projection"],
  projection: ["id", "type", "projection"],
  "evidence-slice": ["id", "type", "slice"],
  canceled: ["id", "type", "jobId"],
  disposed: ["id", "type", "sessionId"],
  error: ["id", "type", "code", "message"],
};

const FORBIDDEN_SESSION_FIELDS = new Set([
  "traceSession",
  "canonicalSession",
  "rawEvents",
  "traceEngineData",
]);

const MANIFEST_KEYS = [
  "version",
  "id",
  "state",
  "importSha256",
  "payloadSha256",
  "retainedBytes",
  "eventCount",
  "resourceCount",
  "sourceMapCount",
  "metadata",
  "settings",
] as const;

const EXPERIMENT_MANIFEST_KEYS = [
  "version",
  "state",
  "scope",
  "runs",
  "issues",
  "differences",
  "acceptedDifferences",
  "coverage",
  "memory",
] as const;

const PROJECTION_KEYS = [
  "boundsMinUs",
  "rangeMs",
  "lanes",
  "names",
  "functionNames",
  "scriptUrls",
  "callFrames",
  "eventKeys",
  "processes",
  "documentFrames",
  "navigations",
  "mainFrameId",
  "mainFrameUrl",
  "defaultNavigationId",
  "markers",
  "screenshots",
  "frames",
  "requests",
  "memory",
  "flows",
  "totalThreads",
  "parseMs",
] as const;

export function validateWorkerResponse(value: unknown): WorkerResponse {
  if (!isWorkerResponse(value)) throw new Error("Invalid worker response envelope");
  if (value.type === "trace-overview") {
    assertAllowedObjectKeys(value.overview, ["startUs", "endUs", "bucketStartUs", "bucketWidthUs", "counts", "eventCount", "retainedEventCount", "retainedBytes", "decompressedBytes"], "trace overview");
    if (!Array.isArray(value.overview.counts) || value.overview.counts.length > 2048 ||
      value.overview.counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
      ![value.overview.startUs, value.overview.endUs, value.overview.bucketStartUs, value.overview.bucketWidthUs, value.overview.eventCount, value.overview.retainedEventCount, value.overview.retainedBytes, value.overview.decompressedBytes].every(Number.isFinite) ||
      value.overview.endUs <= value.overview.startUs || value.overview.bucketWidthUs <= 0) throw new Error("Invalid trace overview.");
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_SESSION_FIELDS.has(key)) {
      throw new Error(`Worker response contains forbidden TraceSession field: ${key}`);
    }
    if (!RESPONSE_KEYS[value.type].includes(key)) {
      throw new Error(`Worker response contains unexpected ${value.type} field: ${key}`);
    }
  }
  if (value.type === "experiment-manifest") {
    assertAllowedObjectKeys(
      value.manifest,
      EXPERIMENT_MANIFEST_KEYS,
      "experiment manifest",
    );
  } else if ("manifest" in value) {
    assertAllowedObjectKeys(value.manifest, MANIFEST_KEYS, "manifest");
  }
  if (
    value.type === "projection" ||
    value.type === "loaded-compatibility-projection"
  ) {
    assertAllowedObjectKeys(value.projection, PROJECTION_KEYS, "projection");
  }
  if (
    value.type === "experiment-manifest" ||
    value.type === "findings" ||
    value.type === "finding-detail" ||
    value.type === "finding-projection" ||
    value.type === "regression-projection" ||
    value.type === "evidence-slice"
  ) {
    assertNoForbiddenSessionFields(value);
  }
  return value;
}

function assertNoForbiddenSessionFields(
  value: unknown,
  visited = new WeakSet<object>(),
): void {
  if (typeof value !== "object" || value === null || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) assertNoForbiddenSessionFields(entry, visited);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_SESSION_FIELDS.has(key)) {
      throw new Error(`Worker response contains forbidden TraceSession field: ${key}`);
    }
    assertNoForbiddenSessionFields(entry, visited);
  }
}

function assertAllowedObjectKeys(
  value: unknown,
  allowedKeys: readonly string[],
  label: string,
): void {
  if (!isRecord(value)) throw new Error(`Worker ${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Worker ${label} contains unexpected field: ${key}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
