import { describe, expect, test } from "vitest";
import { sessionId } from "../domain/analysis";
import { validateWorkerResponse, type WorkerResponse } from "./protocol";
import type { ParsedTraceModel } from "./types";
import { EngineClient } from "./engineClient";

describe("worker transfer protocol", () => {
  test("accepts a bounded compatibility projection and rejects attached TraceSession data", () => {
    const response: WorkerResponse = {
      id: 1,
      type: "loaded-compatibility-projection",
      manifest: {
        version: 1,
        id: sessionId("session:v1:protocol"),
        state: "ready",
        retainedBytes: 1_024,
        eventCount: 1,
        resourceCount: 0,
        sourceMapCount: 0,
      },
      projection: emptyProjection(),
    };

    expect(validateWorkerResponse(response)).toBe(response);
    expect(() =>
      validateWorkerResponse({
        ...response,
        traceSession: {
          rawEvents: [{ name: "must-not-cross" }],
          resources: [{ content: "private source" }],
        },
      }),
    ).toThrow("Worker response contains forbidden TraceSession field: traceSession");
    expect(() =>
      validateWorkerResponse({
        ...response,
        projection: {
          ...response.projection,
          traceSession: { rawEvents: [] },
        },
      }),
    ).toThrow("Worker projection contains unexpected field: traceSession");
    expect(() =>
      validateWorkerResponse({
        id: 2,
        type: "evidence-slice",
        slice: {
          version: 1,
          id: "evidence:v1:nested-session",
          level: "trace-observation",
          availability: { state: "available" },
          unit: "ms",
          byteLength: 2,
          payload: { rawEvents: [] },
        },
      }),
    ).toThrow("Worker response contains forbidden TraceSession field: rawEvents");
  });

  test("the client rejects a worker response carrying complete session data", async () => {
    const worker = new FakeWorker((request) => ({
      id: request.id,
      type: "loaded-compatibility-projection",
      manifest: {
        version: 1,
        id: request.sessionId,
        state: "ready",
        retainedBytes: 1,
      },
      projection: emptyProjection(),
      traceSession: { rawEvents: [] },
    }));
    const client = new EngineClient(() => worker as unknown as Worker);

    await expect(client.parseUrl("/fixture.json")).rejects.toThrow(
      "Worker response contains forbidden TraceSession field: traceSession",
    );
  });

  test("accepts bounded analysis summaries and details but rejects canonical sessions", () => {
    const summary = {
      id: 3,
      type: "findings",
      compatibility: { state: "ready", issues: [] },
      findings: [],
      byteLength: 42,
    };
    const detail = {
      id: 4,
      type: "finding-detail",
      detail: { version: 1, byteLength: 42, finding: {}, provenance: {} },
    };

    expect(validateWorkerResponse(summary)).toBe(summary);
    expect(validateWorkerResponse(detail)).toBe(detail);
    expect(() => validateWorkerResponse({
      ...detail,
      detail: { ...detail.detail, canonicalSession: { events: [] } },
    })).toThrow("Worker response contains forbidden TraceSession field: canonicalSession");
  });
});

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor(
    private readonly response: (request: {
      id: number;
      sessionId: ReturnType<typeof sessionId>;
    }) => unknown,
  ) {}

  postMessage(request: {
    id: number;
    sessionId: ReturnType<typeof sessionId>;
  }): void {
    queueMicrotask(() => {
      this.onmessage?.({ data: this.response(request) } as MessageEvent<unknown>);
    });
  }
}

function emptyProjection(): ParsedTraceModel {
  return {
    boundsMinUs: 0,
    rangeMs: 1,
    lanes: [],
    names: [],
    functionNames: [],
    scriptUrls: [],
    callFrames: [],
    eventKeys: [],
    processes: [],
    documentFrames: [],
    navigations: [],
    mainFrameId: null,
    mainFrameUrl: null,
    defaultNavigationId: null,
    markers: [],
    screenshots: [],
    frames: [],
    requests: [],
    memory: [],
    flows: [],
    totalThreads: 0,
    parseMs: 0,
  };
}
