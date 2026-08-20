import type {
  AnalysisJob,
  AnalysisJobId,
  SessionId,
} from "../../domain/analysis";

export type JobKind = Exclude<AnalysisJob["kind"], "periodicity"> | "dispose";

export type JobCancellationReason =
  | "user-requested"
  | "superseded"
  | "session-disposed";

export type JobEvent<Result> =
  | {
      type: "progress";
      jobId: AnalysisJobId;
      stage: string;
      completed: number;
      total: number;
      sequence: number;
    }
  | {
      type: "result";
      jobId: AnalysisJobId;
      value: Result;
      sequence: number;
    }
  | {
      type: "canceled";
      jobId: AnalysisJobId;
      reason: JobCancellationReason;
      sequence: number;
    }
  | {
      type: "error";
      jobId: AnalysisJobId;
      message: string;
      sequence: number;
    };

export interface JobContext {
  readonly canceled: boolean;
  progress(stage: string, completed: number, total: number): void;
  throwIfCanceled(): void;
}

export interface QueuedJob<Result> {
  id: AnalysisJobId;
  kind: JobKind;
  sessionId?: SessionId;
  sessionIds?: readonly SessionId[];
  supersessionKey?: string;
  run(context: JobContext): Promise<Result>;
}

interface JobState<Result> {
  job: QueuedJob<Result>;
  sequence: number;
  cancellationReason: JobCancellationReason | null;
}

export class JobController<Result> {
  private chain: Promise<void> = Promise.resolve();
  private readonly jobs = new Map<AnalysisJobId, JobState<Result>>();
  private readonly latestBySupersessionKey = new Map<string, AnalysisJobId>();

  constructor(private readonly publish: (event: JobEvent<Result>) => void) {}

  enqueue(job: QueuedJob<Result>): void {
    if (this.jobs.has(job.id)) throw new Error(`Job already exists: ${job.id}`);
    if (job.supersessionKey) {
      const previousId = this.latestBySupersessionKey.get(job.supersessionKey);
      if (previousId) this.cancel(previousId, "superseded");
      this.latestBySupersessionKey.set(job.supersessionKey, job.id);
    }
    const state: JobState<Result> = {
      job,
      sequence: 0,
      cancellationReason: null,
    };
    this.jobs.set(job.id, state);
    this.chain = this.chain.then(() => this.execute(state));
  }

  cancel(
    jobId: AnalysisJobId,
    reason: JobCancellationReason = "user-requested",
  ): boolean {
    const state = this.jobs.get(jobId);
    if (!state || state.cancellationReason) return false;
    state.cancellationReason = reason;
    return true;
  }

  disposeSession(sessionId: SessionId): number {
    let canceled = 0;
    for (const state of this.jobs.values()) {
      if (
        (state.job.sessionId === sessionId || state.job.sessionIds?.includes(sessionId)) &&
        this.cancel(state.job.id, "session-disposed")
      ) {
        canceled++;
      }
    }
    return canceled;
  }

  async idle(): Promise<void> {
    let observed: Promise<void>;
    do {
      observed = this.chain;
      await observed;
    } while (observed !== this.chain);
  }

  private async execute(state: JobState<Result>): Promise<void> {
    const context: JobContext = {
      get canceled() {
        return state.cancellationReason !== null;
      },
      progress: (stage, completed, total) => {
        if (state.cancellationReason) return;
        if (
          !Number.isSafeInteger(completed) ||
          !Number.isSafeInteger(total) ||
          completed < 0 ||
          total < 0 ||
          completed > total
        ) {
          throw new Error("Job progress must use bounded non-negative integers");
        }
        this.publish({
          type: "progress",
          jobId: state.job.id,
          stage,
          completed,
          total,
          sequence: state.sequence++,
        });
      },
      throwIfCanceled: () => {
        if (state.cancellationReason) throw new JobCanceledError();
      },
    };

    try {
      if (!state.cancellationReason) {
        const value = await state.job.run(context);
        if (!state.cancellationReason) {
          this.publish({
            type: "result",
            jobId: state.job.id,
            value,
            sequence: state.sequence++,
          });
        }
      }
    } catch (error) {
      if (!(error instanceof JobCanceledError) && !state.cancellationReason) {
        this.publish({
          type: "error",
          jobId: state.job.id,
          message: error instanceof Error ? error.message : String(error),
          sequence: state.sequence++,
        });
      }
    } finally {
      if (state.cancellationReason) {
        this.publish({
          type: "canceled",
          jobId: state.job.id,
          reason: state.cancellationReason,
          sequence: state.sequence++,
        });
      }
      this.jobs.delete(state.job.id);
      if (
        state.job.supersessionKey &&
        this.latestBySupersessionKey.get(state.job.supersessionKey) === state.job.id
      ) {
        this.latestBySupersessionKey.delete(state.job.supersessionKey);
      }
    }
  }
}

class JobCanceledError extends Error {}
