import {
  analysisJobId,
  sessionId,
  validateAnalysisScope,
  type AnalysisJobId,
} from "../domain/analysis";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import { modelTransferables } from "./transfer";
import { assertTraceSessionConservation } from "./worker/conservation";
import { ingestFullEnvelope } from "./worker/fullEnvelope";
import { buildExperimentManifest } from "./worker/experimentManifest";
import type { ExperimentManifest } from "./experimentContract";
import {
  JobController,
  type JobContext,
  type JobEvent,
  type JobKind,
} from "./worker/jobController";
import type { CpuSourceFinding } from "./worker/cpuSourceAnalysis";
import { buildRegressionProjection } from "./worker/regressionProjection";
import {
  buildCpuSourceEvidenceSlice,
  buildFindingEvidenceSlice,
} from "./worker/evidenceSlice";
import {
  buildCompatibilityProjection,
  buildEventEvidenceSlice,
  buildSessionManifest,
} from "./worker/projections";
import { TraceSessionRepository } from "./worker/sessionRepository";
import type { ExperimentAnalysisResult } from "./worker/analysisResult";
import { experimentAnalysisMatchesScope } from "./worker/analysisScope";
import { runExperimentAnalysisJob } from "./worker/experimentAnalysis";
import { buildFindingDetail } from "./worker/findingDetail";
import { buildFindingProjection } from "./worker/findingProjection";
import {
  canonicalizeTraceSession,
  commitTraceSession,
  discardStagedTraceSession,
  type CanonicalTraceSession,
} from "./worker/traceSession";

type IncomingRequest = WorkerRequest;

interface WorkerJobResult {
  response: WorkerResponse;
  transferables?: Transferable[];
  commit?: () => void;
}

const repository = new TraceSessionRepository();
const requestIdByJob = new Map<AnalysisJobId, number>();
const sessionIdByJob = new Map<AnalysisJobId, ReturnType<typeof sessionId>>();
const workerScope = self as unknown as Worker;
const controller = new JobController<WorkerJobResult>(publishJobEvent);
const cpuSourceFindings = new Map<string, CpuSourceFinding>();
let activeExperimentManifest: ExperimentManifest | null = null;
let activeExperimentAnalysis: ExperimentAnalysisResult | null = null;

workerScope.onmessage = (event: MessageEvent<IncomingRequest>) => {
  handleRequest(event.data);
};

function handleRequest(request: IncomingRequest): void {
  if (request.type === "cancel-job") {
    const canceled = controller.cancel(request.jobId);
    if (!canceled) {
      post({
        id: request.id,
        type: "error",
        code: "not-found",
        message: `Active job not found: ${request.jobId}`,
      });
    }
    return;
  }
  if (request.type === "dispose-session") {
    controller.disposeSession(request.sessionId);
    if (
      activeExperimentManifest?.scope &&
      [
        ...activeExperimentManifest.scope.baselineSessionIds,
        ...activeExperimentManifest.scope.candidateSessionIds,
      ].includes(request.sessionId)
    ) {
      activeExperimentManifest = null;
      activeExperimentAnalysis = null;
      cpuSourceFindings.clear();
    }
    const snapshot = repository.dispose(request.sessionId);
    post({ id: request.id, type: "disposed", sessionId: snapshot.id });
    return;
  }
  if (request.type === "reserve-session") {
    try {
      const snapshot = repository.reserve(request.sessionId, {
        importedBytes: request.importedBytes,
        projectedPeakBytes: request.projectedPeakBytes,
      });
      post({
        id: request.id,
        type: "session-manifest",
        manifest: {
          version: 1,
          id: snapshot.id,
          state: "reserved",
          retainedBytes: 0,
        },
      });
    } catch (error) {
      postError(request.id, error, "security-limit");
    }
    return;
  }

  const jobId =
    request.type === "start-job"
      ? request.job.id
      : analysisJobId(`job:v1:request-${request.id}`);
  requestIdByJob.set(jobId, request.id);
  if ("sessionId" in request) sessionIdByJob.set(jobId, request.sessionId);
  controller.enqueue({
    id: jobId,
    kind: jobKind(request),
    sessionId: "sessionId" in request ? request.sessionId : undefined,
    sessionIds: ownedSessionIds(request),
    supersessionKey: supersessionKey(request),
    run: async (context) => {
      context.progress("queued", 0, 1);
      const result = await runRequest(request, context);
      context.throwIfCanceled();
      context.progress("complete", 1, 1);
      return result;
    },
  });
}

async function runRequest(
  request: Exclude<IncomingRequest, { type: "cancel-job" | "dispose-session" | "reserve-session" }>,
  context: JobContext,
): Promise<WorkerJobResult> {
  if (
    request.type === "load-compatibility-file" ||
    request.type === "load-compatibility-url"
  ) {
    const blob =
      request.type === "load-compatibility-file"
        ? request.file
        : await fetchTraceBlob(request.url);
    const canonical = await ingestAndCommit(blob, request.sessionId, context);
    const projection = buildCompatibilityProjection(canonical);
    return {
      response: {
        id: request.id,
        type: "loaded-compatibility-projection",
        manifest: buildSessionManifest(request.sessionId, canonical),
        projection,
      },
      transferables: modelTransferables(projection),
    };
  }
  if (request.type === "ingest-file" || request.type === "ingest-url") {
    const blob =
      request.type === "ingest-file"
        ? request.file
        : await fetchTraceBlob(request.url);
    const canonical = await ingestAndCommit(blob, request.sessionId, context);
    return {
      response: {
        id: request.id,
        type: "session-manifest",
        manifest: buildSessionManifest(request.sessionId, canonical),
      },
    };
  }
  if (request.type === "request-projection") {
    validateAnalysisScope(request.scope);
    const projection = buildCompatibilityProjection(canonicalSession(request.sessionId));
    return {
      response: { id: request.id, type: "projection", projection },
      transferables: modelTransferables(projection),
    };
  }
  if (request.type === "request-evidence-slice") {
    const slice = buildEventEvidenceSlice(
      canonicalSession(request.sessionId),
      request.evidenceId,
      request.eventKey,
    );
    return { response: { id: request.id, type: "evidence-slice", slice } };
  }
  if (request.type === "create-experiment") {
    const manifest = buildExperimentManifest(repository, request.input);
    return {
      response: { id: request.id, type: "experiment-manifest", manifest },
      commit: () => {
        activeExperimentManifest = manifest;
        activeExperimentAnalysis = null;
        cpuSourceFindings.clear();
      },
    };
  }
  if (request.type === "request-regression-projection") {
    validateAnalysisScope(request.scope);
    if (!activeExperimentAnalysis) throw new Error("Experiment analysis is unavailable");
    const projection = buildRegressionProjection(activeExperimentAnalysis, request.scope);
    return {
      response: { id: request.id, type: "regression-projection", projection },
    };
  }
  if (request.type === "request-finding-detail") {
    validateAnalysisScope(request.scope);
    if (!activeExperimentAnalysis) throw new Error("Experiment analysis is unavailable");
    if (!experimentAnalysisMatchesScope(activeExperimentAnalysis, request.scope)) {
      throw new Error("Finding detail scope does not match the active analysis");
    }
    const detail = buildFindingDetail(activeExperimentAnalysis, request.findingId);
    return { response: { id: request.id, type: "finding-detail", detail } };
  }
  if (request.type === "request-finding-projection") {
    validateAnalysisScope(request.scope);
    if (!activeExperimentAnalysis) throw new Error("Experiment analysis is unavailable");
    if (!experimentAnalysisMatchesScope(activeExperimentAnalysis, request.scope)) {
      throw new Error("Finding projection scope does not match the active analysis");
    }
    const projection = buildFindingProjection(activeExperimentAnalysis, request.scope);
    return { response: { id: request.id, type: "finding-projection", projection } };
  }
  if (request.type === "request-tracer-evidence") {
    validateAnalysisScope(request.scope);
    const result = cpuSourceFindings.get(request.findingId);
    if (!result || !result.finding.evidenceIds.includes(request.evidenceId)) {
      throw new Error(`Finding evidence not found: ${request.findingId}`);
    }
    const slice = buildCpuSourceEvidenceSlice(result, request.scope, repository);
    return { response: { id: request.id, type: "evidence-slice", slice } };
  }
  if (request.type === "request-finding-evidence") {
    validateAnalysisScope(request.scope);
    if (!activeExperimentAnalysis) throw new Error("Experiment analysis is unavailable");
    const slice = buildFindingEvidenceSlice(
      activeExperimentAnalysis,
      request.scope,
      repository,
      request.query,
    );
    return { response: { id: request.id, type: "evidence-slice", slice } };
  }

  if (request.type !== "start-job") {
    throw new Error("Unsupported worker request");
  }
  if (!("scope" in request.job)) {
    throw new Error(`${request.job.kind} jobs require an ingestion request`);
  }
  validateAnalysisScope(request.job.scope);
  repository.admitCohort(
    request.job.scope.baselineSessionIds,
    request.job.scope.candidateSessionIds,
  );
  if (request.job.kind !== "cohort-scan") {
    return {
      response: {
        id: request.id,
        type: "findings",
        compatibility: { state: "ready", issues: [] },
        findings: [],
        byteLength: 2,
      },
    };
  }
  if (!activeExperimentManifest) {
    throw new Error("A compatible experiment manifest is required before analysis");
  }
  const analysis = await runExperimentAnalysisJob(
    repository,
    activeExperimentManifest,
    request.job.scope,
    context,
  );
  return {
    response: {
      id: request.id,
      type: "findings",
      compatibility: analysis.compatibility,
      findings: analysis.findings,
      byteLength: analysis.byteLength,
    },
    commit: () => {
      activeExperimentAnalysis = analysis;
      cpuSourceFindings.clear();
      for (const [id, finding] of analysis.cpuSourceByFindingId) {
        cpuSourceFindings.set(id, finding);
      }
    },
  };
}

async function ingestAndCommit(
  blob: Blob,
  id: ReturnType<typeof sessionId>,
  context: JobContext,
): Promise<CanonicalTraceSession> {
  let stage: Awaited<ReturnType<typeof ingestFullEnvelope>> | undefined;
  try {
    stage = await ingestFullEnvelope(
      blob,
      id,
      repository,
      undefined,
      (completed, total) => context.progress("ingesting", completed, total),
    );
    context.throwIfCanceled();
    context.progress("canonicalizing", 0, 1);
    const canonical = await canonicalizeTraceSession(stage);
    context.throwIfCanceled();
    assertTraceSessionConservation(stage.envelope, canonical);
    commitTraceSession(repository, stage, canonical);
    context.progress("canonicalizing", 1, 1);
    return canonical;
  } catch (error) {
    discardStagedTraceSession(repository, id, stage);
    throw error;
  }
}

function canonicalSession(id: ReturnType<typeof sessionId>): CanonicalTraceSession {
  const canonical = repository.getCanonicalForWorker(id);
  if (!canonical.compatibilityProjection || !isRecord(canonical.evidence)) {
    throw new Error(`Session has no canonical trace evidence: ${id}`);
  }
  return canonical as CanonicalTraceSession;
}

async function fetchTraceBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Trace request failed: ${response.status}`);
  return response.blob();
}

function publishJobEvent(event: JobEvent<WorkerJobResult>): void {
  const id = requestIdByJob.get(event.jobId) ?? 0;
  if (event.type === "result") {
    event.value.commit?.();
    post(event.value.response, event.value.transferables);
    requestIdByJob.delete(event.jobId);
    sessionIdByJob.delete(event.jobId);
    return;
  }
  if (event.type === "progress") {
    post({
      id,
      type: "progress",
      jobId: event.jobId,
      completed: event.completed,
      total: event.total,
      stage: event.stage,
    });
    return;
  }
  if (event.type === "canceled") {
    const canceledSessionId = sessionIdByJob.get(event.jobId);
    if (canceledSessionId && repository.has(canceledSessionId)) {
      repository.dispose(canceledSessionId);
    }
    post({ id, type: "canceled", jobId: event.jobId });
  } else {
    post({ id, type: "error", code: "internal", message: event.message });
  }
  requestIdByJob.delete(event.jobId);
  sessionIdByJob.delete(event.jobId);
}

function jobKind(request: IncomingRequest): JobKind {
  switch (request.type) {
    case "ingest-file":
    case "ingest-url":
    case "load-compatibility-file":
    case "load-compatibility-url":
      return "parse";
    case "request-projection":
      return "projection";
    case "request-evidence-slice":
      return "evidence-slice";
    case "create-experiment":
      return "cohort-scan";
    case "request-regression-projection":
    case "request-finding-projection":
      return "projection";
    case "request-tracer-evidence":
    case "request-finding-evidence":
    case "request-finding-detail":
      return "evidence-slice";
    case "start-job":
      return request.job.kind === "cohort-scan" || request.job.kind === "periodicity"
        ? "cohort-scan"
        : request.job.kind;
    case "reserve-session":
    case "cancel-job":
    case "dispose-session":
      return "dispose";
  }
}

function supersessionKey(request: IncomingRequest): string | undefined {
  if (
    request.type === "load-compatibility-file" ||
    request.type === "load-compatibility-url"
  ) {
    return `compatibility:${request.slot}`;
  }
  if ("sessionId" in request) return `${request.sessionId}:${request.type}`;
  if (request.type === "create-experiment") return "experiment:manifest";
  if (request.type === "request-finding-detail") return "analysis:finding-detail";
  if (request.type === "request-finding-evidence") return "analysis:finding-evidence";
  if (request.type === "request-regression-projection") return "analysis:projection";
  if (request.type === "request-finding-projection") return "analysis:finding-projection";
  return request.type === "start-job" ? `analysis:${request.job.kind}` : undefined;
}

function ownedSessionIds(request: IncomingRequest): readonly ReturnType<typeof sessionId>[] | undefined {
  if (request.type === "create-experiment") {
    return [...request.input.baselineSessionIds, ...request.input.candidateSessionIds];
  }
  if (request.type === "start-job" && "scope" in request.job) {
    return [
      ...request.job.scope.baselineSessionIds,
      ...request.job.scope.candidateSessionIds,
    ];
  }
  if ("scope" in request) {
    return [
      ...request.scope.baselineSessionIds,
      ...request.scope.candidateSessionIds,
    ];
  }
  return undefined;
}

function post(
  response: WorkerResponse,
  transferables: Transferable[] = [],
): void {
  workerScope.postMessage(response, transferables);
}

function postError(
  id: number,
  error: unknown,
  code: Extract<WorkerResponse, { type: "error" }>["code"],
): void {
  post({
    id,
    type: "error",
    code,
    message: error instanceof Error ? error.message : String(error),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
