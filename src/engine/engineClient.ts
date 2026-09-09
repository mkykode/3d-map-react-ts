import {
  analysisJobId,
  sessionId,
  type AnalysisScope,
  type Finding,
  type FindingId,
  type SessionId,
} from "../domain/analysis";
import type { EvidenceIdentity } from "../domain/evidence";
import type { EvidenceSliceQuery } from "../evidence/query";
import {
  validateWorkerResponse,
  type SessionManifest,
  type WorkerRequest,
  type WorkerResponse,
} from "./protocol";
import type { ParsedTraceModel } from "./types";
import type { TraceOverview, TraceWindow } from "./ingest/types";
import type {
  ExperimentManifest,
  ExperimentManifestInput,
} from "./experimentContract";
import type {
  CpuSourceEvidenceSlice,
  FindingEvidenceSlice,
  FindingDetail,
  FindingProjection,
  RegressionProjection,
} from "./findingContract";

export interface LoadedTrace {
  manifest: SessionManifest;
  projection: ParsedTraceModel;
}

interface PendingRequest {
  expectedType: WorkerResponse["type"];
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: EngineProgress) => void;
  cleanup?: () => void;
}

type RequestWithoutId<T = WorkerRequest> = T extends { id: number }
  ? Omit<T, "id">
  : never;

export interface EngineProgress {
  stage: string;
  completed: number;
  total: number;
}

export interface EngineRequestOptions {
  signal?: AbortSignal;
  onProgress?: (progress: EngineProgress) => void;
}

/** Main-thread facade. Complete sessions and scans remain worker-owned. */
export class EngineClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private nextSessionId = 1;
  private nextAnalysisJobId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(
    private readonly workerFactory: () => Worker = () =>
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
  ) {}

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = this.workerFactory();
    this.worker.onmessage = (event: MessageEvent<unknown>) => {
      let response: WorkerResponse;
      try {
        response = validateWorkerResponse(event.data);
      } catch (error) {
        const id = isRecord(event.data) && typeof event.data.id === "number"
          ? event.data.id
          : null;
        const entry = id === null ? undefined : this.pending.get(id);
        if (id !== null) this.settle(id);
        entry?.reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      const entry = this.pending.get(response.id);
      if (!entry) return;
      if (response.type === "progress") {
        entry.onProgress?.({
          stage: response.stage,
          completed: response.completed,
          total: response.total,
        });
        return;
      }
      if (response.type === "canceled") {
        this.settle(response.id);
        entry.reject(new Error("Analysis canceled"));
        return;
      }
      if (response.type === "error") {
        this.settle(response.id);
        entry.reject(new Error(response.message));
        return;
      }
      if (response.type !== entry.expectedType) {
        this.settle(response.id);
        entry.reject(
          new Error(
            `Unexpected worker response ${response.type}; expected ${entry.expectedType}`,
          ),
        );
        return;
      }
      this.settle(response.id);
      entry.resolve(response);
    };
    this.worker.onerror = (event) => {
      const failure = new Error(`Analysis worker failed: ${event.message}`);
      for (const entry of this.pending.values()) {
        entry.cleanup?.();
        entry.reject(failure);
      }
      this.pending.clear();
    };
    return this.worker;
  }

  async parseFile(
    file: File,
    slot: "primary" | "secondary" = "primary",
    options?: EngineRequestOptions & { optimized?: boolean; window?: TraceWindow },
  ): Promise<LoadedTrace> {
    const response = await this.request(
      {
        type: "load-compatibility-file",
        sessionId: this.createSessionId(),
        slot,
        file,
        optimized: options?.optimized,
        window: options?.window,
      },
      "loaded-compatibility-projection",
      options,
    );
    if (response.type !== "loaded-compatibility-projection") {
      throw new Error("Worker omitted compatibility projection");
    }
    return { manifest: response.manifest, projection: response.projection };
  }

  async scanFile(file: File, slot: "primary" | "secondary", options?: EngineRequestOptions): Promise<TraceOverview> {
    const response = await this.request({ type: "scan-trace", file, slot }, "trace-overview", options);
    if (response.type !== "trace-overview") throw new Error("Worker omitted trace overview.");
    return response.overview;
  }

  async parseUrl(
    url: string,
    slot: "primary" | "secondary" = "primary",
  ): Promise<LoadedTrace> {
    const response = await this.request(
      {
        type: "load-compatibility-url",
        sessionId: this.createSessionId(),
        slot,
        url,
      },
      "loaded-compatibility-projection",
    );
    if (response.type !== "loaded-compatibility-projection") {
      throw new Error("Worker omitted compatibility projection");
    }
    return { manifest: response.manifest, projection: response.projection };
  }

  async disposeSession(session: SessionId): Promise<void> {
    await this.request({ type: "dispose-session", sessionId: session }, "disposed");
  }

  async ingestFile(
    file: File,
    options?: EngineRequestOptions,
  ): Promise<SessionManifest> {
    const response = await this.request(
      { type: "ingest-file", sessionId: this.createSessionId(), file },
      "session-manifest",
      options,
    );
    if (response.type !== "session-manifest") {
      throw new Error("Worker omitted session manifest");
    }
    return response.manifest;
  }

  async createExperimentManifest(
    input: ExperimentManifestInput,
    options?: EngineRequestOptions,
  ): Promise<ExperimentManifest> {
    const response = await this.request(
      { type: "create-experiment", input },
      "experiment-manifest",
      options,
    );
    if (response.type !== "experiment-manifest") {
      throw new Error("Worker omitted experiment manifest");
    }
    return response.manifest;
  }

  async analyzeExperiment(
    scope: AnalysisScope,
    options?: EngineRequestOptions,
  ): Promise<readonly Finding[]> {
    const response = await this.request(
      {
        type: "start-job",
        job: {
          version: 1,
          id: analysisJobId(`job:v1:analysis-${this.nextAnalysisJobId++}`),
          kind: "cohort-scan",
          scope,
        },
      },
      "findings",
      options,
    );
    if (response.type !== "findings") {
      throw new Error("Worker omitted finding summaries");
    }
    return response.findings;
  }

  async requestRegressionProjection(
    scope: AnalysisScope,
    options?: EngineRequestOptions,
  ): Promise<RegressionProjection> {
    const response = await this.request(
      { type: "request-regression-projection", scope },
      "regression-projection",
      options,
    );
    if (response.type !== "regression-projection") {
      throw new Error("Worker omitted regression projection");
    }
    return response.projection;
  }

  async requestTracerEvidence(
    scope: AnalysisScope,
    findingId: FindingId,
    evidenceId: EvidenceIdentity,
    options?: EngineRequestOptions,
  ): Promise<CpuSourceEvidenceSlice> {
    const response = await this.request(
      { type: "request-tracer-evidence", scope, findingId, evidenceId },
      "evidence-slice",
      options,
    );
    if (response.type !== "evidence-slice") {
      throw new Error("Worker omitted tracer evidence");
    }
    return response.slice as CpuSourceEvidenceSlice;
  }

  async requestFindingEvidence(
    scope: AnalysisScope,
    query: EvidenceSliceQuery,
    options?: EngineRequestOptions,
  ): Promise<FindingEvidenceSlice> {
    const response = await this.request(
      { type: "request-finding-evidence", scope, query },
      "evidence-slice",
      options,
    );
    if (response.type !== "evidence-slice") {
      throw new Error("Worker omitted finding evidence");
    }
    return response.slice as FindingEvidenceSlice;
  }

  async requestFindingDetail(
    scope: AnalysisScope,
    findingId: FindingId,
    options?: EngineRequestOptions,
  ): Promise<FindingDetail> {
    const response = await this.request(
      { type: "request-finding-detail", scope, findingId },
      "finding-detail",
      options,
    );
    if (response.type !== "finding-detail") {
      throw new Error("Worker omitted finding detail");
    }
    return response.detail;
  }

  async requestFindingProjection(
    scope: AnalysisScope,
    options?: EngineRequestOptions,
  ): Promise<FindingProjection> {
    const response = await this.request(
      { type: "request-finding-projection", scope },
      "finding-projection",
      options,
    );
    if (response.type !== "finding-projection") {
      throw new Error("Worker omitted finding projection");
    }
    return response.projection;
  }

  private request(
    payload: RequestWithoutId,
    expectedType: WorkerResponse["type"],
    options: EngineRequestOptions = {},
  ): Promise<WorkerResponse> {
    const worker = this.ensureWorker();
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new Error("Analysis canceled"));
        return;
      }
      const onAbort = () => {
        const jobId = payload.type === "start-job"
          ? payload.job.id
          : analysisJobId(`job:v1:request-${id}`);
        worker.postMessage({
          id: this.nextRequestId++,
          type: "cancel-job",
          jobId,
        } satisfies WorkerRequest);
      };
      options.signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(id, {
        expectedType,
        resolve,
        reject,
        onProgress: options.onProgress,
        cleanup: () => options.signal?.removeEventListener("abort", onAbort),
      });
      worker.postMessage({ ...payload, id } satisfies WorkerRequest);
    });
  }

  private settle(id: number): void {
    const entry = this.pending.get(id);
    entry?.cleanup?.();
    this.pending.delete(id);
  }

  private createSessionId(): SessionId {
    return sessionId(`session:v1:client-${this.nextSessionId++}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const engineClient = new EngineClient();
