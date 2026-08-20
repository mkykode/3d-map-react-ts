import { describe, expect, test } from "vitest";
import { analysisJobId, sessionId } from "../../domain/analysis";
import { JobController, type JobEvent } from "./jobController";

describe("JobController", () => {
  test("serializes work, reports deterministic progress, and suppresses superseded results", async () => {
    const events: JobEvent<string>[] = [];
    const controller = new JobController<string>((event) => events.push(event));
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    let active = 0;
    let maxActive = 0;

    controller.enqueue({
      id: analysisJobId("job:v1:first"),
      kind: "parse",
      supersessionKey: "primary",
      run: async (context) => {
        active++;
        maxActive = Math.max(maxActive, active);
        context.progress("reading", 1, 2);
        firstStarted.resolve();
        await releaseFirst.promise;
        active--;
        return "stale";
      },
    });
    await firstStarted.promise;
    controller.enqueue({
      id: analysisJobId("job:v1:second"),
      kind: "parse",
      supersessionKey: "primary",
      run: async (context) => {
        active++;
        maxActive = Math.max(maxActive, active);
        context.progress("reading", 2, 2);
        active--;
        return "fresh";
      },
    });
    releaseFirst.resolve();
    await controller.idle();

    expect(maxActive).toBe(1);
    expect(events.filter((event) => event.type === "result")).toEqual([
      {
        type: "result",
        jobId: analysisJobId("job:v1:second"),
        value: "fresh",
        sequence: 1,
      },
    ]);
    expect(events).toContainEqual({
      type: "canceled",
      jobId: analysisJobId("job:v1:first"),
      reason: "superseded",
      sequence: 1,
    });
    expect(events).not.toContainEqual(expect.objectContaining({ value: "stale" }));
  });

  test("disposal cancels every session job with a specific reason and no stale result", async () => {
    const events: JobEvent<string>[] = [];
    const controller = new JobController<string>((event) => events.push(event));
    const started = deferred<void>();
    const release = deferred<void>();
    const ownedSession = sessionId("session:v1:disposed");

    controller.enqueue({
      id: analysisJobId("job:v1:disposed-parse"),
      kind: "canonicalize",
      sessionId: ownedSession,
      run: async () => {
        started.resolve();
        await release.promise;
        return "must-not-publish";
      },
    });
    await started.promise;
    expect(controller.disposeSession(ownedSession)).toBe(1);
    release.resolve();
    await controller.idle();

    expect(events).toContainEqual({
      type: "canceled",
      jobId: analysisJobId("job:v1:disposed-parse"),
      reason: "session-disposed",
      sequence: 0,
    });
    expect(events).not.toContainEqual(
      expect.objectContaining({ value: "must-not-publish" }),
    );
  });

  test("disposal cancels a cohort job owned by every scoped session", async () => {
    const events: JobEvent<string>[] = [];
    const controller = new JobController<string>((event) => events.push(event));
    const started = deferred<void>();
    const release = deferred<void>();
    const baseline = sessionId("session:v1:baseline-1");
    const candidate = sessionId("session:v1:candidate-1");

    controller.enqueue({
      id: analysisJobId("job:v1:cohort"),
      kind: "cohort-scan",
      sessionIds: [baseline, candidate],
      run: async () => {
        started.resolve();
        await release.promise;
        return "must-not-publish";
      },
    });
    await started.promise;
    expect(controller.disposeSession(candidate)).toBe(1);
    release.resolve();
    await controller.idle();

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "canceled",
        jobId: analysisJobId("job:v1:cohort"),
        reason: "session-disposed",
      }),
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({ value: "must-not-publish" }),
    );
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
