import { afterEach, describe, expect, it, vi } from "vitest";
import { engineClient } from "../engine/engineClient";
import {
  findingId,
  sessionId,
  type AnalysisScope,
  type Finding,
} from "../domain/analysis";
import { evidenceIdentity } from "../domain/evidence";
import type { SessionManifest } from "../engine/protocol";
import type { ParsedTraceModel } from "../engine/types";
import type { RegressionProjection } from "../engine/findingContract";
import { useAppStore, useHoverStore } from "./store";

function model(defaultNavigationId: string): ParsedTraceModel {
  return {
    boundsMinUs: 0,
    rangeMs: 100,
    lanes: [],
    names: [],
    functionNames: [],
    scriptUrls: [],
    callFrames: [],
    eventKeys: [],
    processes: [],
    documentFrames: [],
    navigations: [
      {
        kind: "hard",
        id: defaultNavigationId,
        frameId: "frame",
        processId: 1,
        emittingThreadId: 2,
        start: 0,
        end: 100,
        url: "https://example.com/",
        isOutermostMainFrame: true,
        isLoadingMainFrame: true,
      },
    ],
    mainFrameId: "frame",
    mainFrameUrl: "https://example.com/",
    defaultNavigationId,
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

function loaded(defaultNavigationId: string) {
  return {
    manifest: manifest(defaultNavigationId),
    projection: model(defaultNavigationId),
  };
}

function manifest(id: string): SessionManifest {
  return {
    version: 1,
    id: sessionId(`session:v1:${id}`),
    state: "ready",
    retainedBytes: 1_024,
  };
}

afterEach(() => {
  useAppStore.getState().cancelTraceImport();
  vi.restoreAllMocks();
  useAppStore.setState({
    model: null,
    primarySession: null,
    secondarySession: null,
    brush: null,
    selectedNavigationId: null,
    selection: null,
    zoomed: false,
    analysisScope: null,
    analysisFindings: [],
    analysisRegressionProjection: null,
    cameraCommand: { id: 0, kind: "reset" },
    cameraInput: null,
    cameraPose: null,
    cameraMode: "strategy",
    traceImport: null,
    lastTraceImport: null,
  });
  useHoverStore.setState({ hover: null });
});

describe("large-file import lifecycle", () => {
  const overview = { startUs: 1000, endUs: 20_001_000, bucketStartUs: 0, bucketWidthUs: 100_000, counts: [1, 2], eventCount: 100, retainedEventCount: 90, retainedBytes: 1024, decompressedBytes: 100 * 1024 ** 2 };
  const file = () => {
    const input = new File(["{}"], "large.json");
    Object.defineProperty(input, "size", { value: 100 * 1024 ** 2 });
    return input;
  };

  it("waits for a window choice, passes it to the worker and retains it for reopening", async () => {
    vi.spyOn(engineClient, "scanFile").mockResolvedValue(overview);
    const parse = vi.spyOn(engineClient, "parseFile").mockResolvedValue(loaded("large"));
    vi.spyOn(engineClient, "disposeSession").mockResolvedValue();
    await useAppStore.getState().loadPrimaryFile(file());
    expect(parse).not.toHaveBeenCalled();
    expect(useAppStore.getState().traceImport?.phase).toBe("choosing");
    const window = [1_001_000, 3_001_000] as const;
    await useAppStore.getState().confirmTraceImport(window);
    expect(parse).toHaveBeenCalledWith(expect.any(File), "primary", expect.objectContaining({ optimized: true, window }));
    expect(useAppStore.getState().primarySession?.id).toBe("session:v1:large");
    useAppStore.getState().reopenTraceImport();
    expect(useAppStore.getState().traceImport).toMatchObject({ phase: "choosing", selectedWindow: window });
  });

  it("keeps a failed window editable and ignores a late result after cancellation", async () => {
    vi.spyOn(engineClient, "scanFile").mockResolvedValue(overview);
    const parse = vi.spyOn(engineClient, "parseFile").mockRejectedValue(new Error("Choose a shorter time window."));
    const dispose = vi.spyOn(engineClient, "disposeSession").mockResolvedValue();
    await useAppStore.getState().loadSecondaryFile(file());
    await useAppStore.getState().confirmTraceImport([1_001_000, 3_001_000]);
    expect(useAppStore.getState().traceImport).toMatchObject({ phase: "choosing", selectedWindow: [1_001_000, 3_001_000], error: "Choose a shorter time window." });
    let resolve!: (value: ReturnType<typeof loaded>) => void;
    parse.mockReturnValue(new Promise((done) => { resolve = done; }));
    const completion = useAppStore.getState().confirmTraceImport([1_001_000, 2_001_000]);
    useAppStore.getState().cancelTraceImport();
    resolve(loaded("canceled"));
    await completion;
    expect(dispose).toHaveBeenCalledWith("session:v1:canceled");
    expect(useAppStore.getState().secondarySession).toBeNull();
    expect(useAppStore.getState().traceImport).toBeNull();
  });
});

describe("selected navigation ownership", () => {
  it("installs the model default and accepts only owned navigation IDs", async () => {
    const parsed = loaded("nav-a");
    vi.spyOn(engineClient, "parseUrl").mockResolvedValue(parsed);
    const dispose = vi.spyOn(engineClient, "disposeSession").mockResolvedValue();

    await useAppStore.getState().loadDemo();
    expect(useAppStore.getState().selectedNavigationId).toBe("nav-a");
    expect(useAppStore.getState().primarySession).toEqual(parsed.manifest);

    useAppStore.getState().setSelectedNavigationId("missing");
    expect(useAppStore.getState().selectedNavigationId).toBe("nav-a");

    useAppStore.getState().setSelectedNavigationId(null);
    expect(useAppStore.getState().selectedNavigationId).toBeNull();

    vi.mocked(engineClient.parseUrl).mockResolvedValue(loaded("nav-b"));
    await useAppStore.getState().loadDemo();
    expect(useAppStore.getState().selectedNavigationId).toBe("nav-b");
    expect(dispose).toHaveBeenCalledWith(parsed.manifest.id);
  });

  it("clears analysis state owned by the previous model", async () => {
    vi.spyOn(engineClient, "parseUrl").mockResolvedValue(loaded("nav-b"));
    vi.spyOn(engineClient, "disposeSession").mockResolvedValue();
    useAppStore.setState({
      model: model("nav-a"),
      brush: [10, 20],
      selectedNavigationId: "nav-a",
      selection: { kind: "entry", lane: 0, idx: 0 },
      zoomed: true,
    });
    useHoverStore.setState({
      hover: { source: "canyon", lane: 0, idx: 0, clientX: 12, clientY: 24 },
    });

    await useAppStore.getState().loadDemo();

    expect(useAppStore.getState()).toMatchObject({
      brush: null,
      selectedNavigationId: "nav-b",
      selection: null,
      zoomed: false,
    });
    expect(useHoverStore.getState().hover).toBeNull();
  });
});

describe("camera analysis bridge", () => {
  it("preserves AnalysisScope and selected evidence across fit and reset actions", () => {
    const scope = analysisScope();
    const finding = analysisFinding();
    const legacySelection = { kind: "entry", lane: 0, idx: 2 } as const;
    useAppStore.setState({ selection: legacySelection });

    useAppStore.getState().setAnalysisResults(scope, [finding]);
    useAppStore.getState().selectAnalysisFinding(
      finding.id,
      finding.evidenceIds[0],
    );
    const selectedScope = useAppStore.getState().analysisScope;

    for (const kind of ["fit-all", "fit-selection", "reset"] as const) {
      useAppStore.getState().requestCameraAction(kind);
      expect(useAppStore.getState().analysisScope).toEqual(selectedScope);
      expect(useAppStore.getState().selection).toEqual(legacySelection);
      expect(useAppStore.getState().cameraCommand.kind).toBe(kind);
    }
  });

  it("defaults to strategy mode and preserves scope and selection through free mode", () => {
    const scope = analysisScope();
    const finding = analysisFinding();
    useAppStore.getState().setAnalysisResults(scope, [finding]);
    useAppStore.getState().selectAnalysisFinding(
      finding.id,
      finding.evidenceIds[0],
    );
    const selectedScope = useAppStore.getState().analysisScope;

    expect(useAppStore.getState().cameraMode).toBe("strategy");
    useAppStore.getState().setCameraMode("free");
    expect(useAppStore.getState().analysisScope).toEqual(selectedScope);
    useAppStore.getState().setCameraMode("strategy");
    expect(useAppStore.getState().analysisScope).toEqual(selectedScope);
  });

  it("focuses next and previous same-stage regression marks without changing scope", () => {
    const scope = analysisScope();
    const first = analysisFinding();
    const second: Finding = {
      ...first,
      id: findingId("finding:v1:checkout-network"),
      title: "network",
      semanticIdentity: "request:GET:https://example.test/app.js",
      domain: "network",
      evidenceIds: [evidenceIdentity("evidence:v1:checkout-network")],
    };
    useAppStore.getState().setAnalysisResults(scope, [first, second]);
    useAppStore.getState().setAnalysisRegressionProjection(
      regressionProjection(first, second),
    );
    useAppStore.getState().selectAnalysisFinding(first.id, first.evidenceIds[0]);
    const cohortScope = {
      baselineSessionIds: scope.baselineSessionIds,
      candidateSessionIds: scope.candidateSessionIds,
      scenario: scope.scenario,
      domains: scope.domains,
    };

    useAppStore.getState().focusAnalysisFinding("next");
    expect(useAppStore.getState().analysisScope).toMatchObject({
      ...cohortScope,
      selectedFindingId: second.id,
      selectedEvidenceId: second.evidenceIds[0],
    });
    expect(useAppStore.getState().cameraCommand.kind).toBe("fit-selection");

    useAppStore.getState().focusAnalysisFinding("previous");
    expect(useAppStore.getState().analysisScope?.selectedFindingId).toBe(first.id);
  });
});

function analysisScope(): AnalysisScope {
  return {
    version: 1,
    baselineSessionIds: ["a", "b", "c"].map((id) =>
      sessionId(`session:v1:baseline-${id}`),
    ),
    candidateSessionIds: ["a", "b", "c"].map((id) =>
      sessionId(`session:v1:candidate-${id}`),
    ),
    scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
    timeWindowMs: null,
    domains: ["cpu-source"],
    selectedFindingId: null,
    selectedEvidenceId: null,
  };
}

function analysisFinding(): Finding {
  return {
    version: 1,
    id: findingId("finding:v1:checkout-work"),
    domain: "cpu-source",
    semanticIdentity: "work",
    title: "work",
    status: "regression",
    measurement: {
      unit: "ms",
      baseline: 10,
      candidate: 20,
      absoluteDelta: 10,
      relativeDelta: 1,
      dispersion: 0,
      baselineSamples: 3,
      candidateSamples: 3,
      baselineCompleteness: 1,
      candidateCompleteness: 1,
    },
    evidenceLevel: "trace-observation",
    evidenceQuality: { class: "authored-source", weight: 1 },
    promotion: { eligible: true, reasons: [] },
    missingness: {
      state: "complete",
      baselineMissing: 0,
      candidateMissing: 0,
    },
    availability: { state: "available" },
    evidenceIds: [evidenceIdentity("evidence:v1:checkout-work")],
    derivation: { version: "test", parameters: {} },
  };
}

function regressionProjection(
  first: Finding,
  second: Finding,
): RegressionProjection {
  const marks = [
    {
      finding: first,
      kind: "source" as const,
      contributorId: "contributor:v1:first",
      position: [0, 4, 0] as const,
    },
    {
      finding: second,
      kind: "request" as const,
      contributorId: "contributor:v1:second",
      position: [12, 4, 10] as const,
    },
  ].map(({ finding, kind, contributorId, position }) => ({
    findingId: finding.id,
    evidenceId: finding.evidenceIds[0],
    contributorId,
    kind,
    domain: finding.domain,
    semanticIdentity: finding.semanticIdentity,
    title: finding.title,
    unit: finding.measurement.unit,
    scaleId: `scale:v1:${kind}-ms`,
    baselineValue: finding.measurement.baseline,
    candidateValue: finding.measurement.candidate,
    absoluteDelta: finding.measurement.absoluteDelta,
    status: finding.status,
    availability: finding.availability,
    gap: null,
    position,
    size: [6, 8, 7] as const,
  }));
  return {
    version: 1,
    layout: "multi-domain-regression-v1",
    scenario: { kind: "marker", markerName: "checkout", occurrence: 1 },
    marks,
    scales: {},
    contributors: Object.fromEntries(marks.map((mark) => [
      mark.contributorId,
      { findingId: mark.findingId, evidenceId: mark.evidenceId },
    ])),
    edges: [],
    byteLength: 1,
  };
}
