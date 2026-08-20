import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { SessionManifest } from "../engine/protocol";
import {
  engineClient,
  type EngineProgress,
} from "../engine/engineClient";
import type {
  CaptureContextField,
  ExperimentManifest as ExperimentManifestData,
  Phase5AnalysisDomain,
} from "../engine/experimentContract";
import { PHASE5_ANALYSIS_DOMAINS } from "../engine/experimentContract";
import { ExperimentManifest } from "./ExperimentManifest";
import type {
  CpuSourceEvidenceSlice,
  FindingEvidenceSlice,
} from "../engine/findingContract";
import type {
  RegressionMark,
} from "../engine/findingContract";
import { useAppStore } from "../state/store";
import { TracerEvidencePanel } from "./TracerEvidencePanel";
import { FindingsPanel } from "./FindingsPanel";
import { evidenceSliceQuery } from "../evidence/query";
import { ENGINE_LIMITS } from "../engine/limits";

const CAPTURE_DIFFERENCES: readonly {
  field: CaptureContextField;
  label: string;
}[] = [
  { field: "browserContext", label: "Browser context" },
  { field: "throttling", label: "Throttling" },
  { field: "navigationOwnership", label: "Navigation ownership" },
];

const DOMAIN_LABELS: Record<Phase5AnalysisDomain, string> = {
  "cpu-source": "CPU source",
  browser: "Browser",
  network: "Network",
  frame: "Frames",
  metric: "Metrics",
};

interface RunProgress extends EngineProgress {
  label: string;
}

export function ExperimentImport() {
  const [open, setOpen] = useState(false);
  const [baselineFiles, setBaselineFiles] = useState<File[]>([]);
  const [candidateFiles, setCandidateFiles] = useState<File[]>([]);
  const [scenario, setScenario] = useState("checkout");
  const [acceptedDifferences, setAcceptedDifferences] = useState<
    CaptureContextField[]
  >([]);
  const [selectedDomains, setSelectedDomains] = useState<Phase5AnalysisDomain[]>(
    () => [...PHASE5_ANALYSIS_DOMAINS],
  );
  const [manifest, setManifest] = useState<ExperimentManifestData | null>(null);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [runProgress, setRunProgress] = useState<RunProgress[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [hasSessions, setHasSessions] = useState(false);
  const findings = useAppStore((state) => state.analysisFindings);
  const selectedFindingId = useAppStore(
    (state) => state.analysisScope?.selectedFindingId ?? null,
  );
  const setAnalysisResults = useAppStore((state) => state.setAnalysisResults);
  const clearAnalysisResults = useAppStore((state) => state.clearAnalysisResults);
  const setAnalysisFindingProjection = useAppStore(
    (state) => state.setAnalysisFindingProjection,
  );
  const regressionProjection = useAppStore(
    (state) => state.analysisRegressionProjection,
  );
  const setRegressionProjection = useAppStore(
    (state) => state.setAnalysisRegressionProjection,
  );
  const setView = useAppStore((state) => state.setView);
  const selectAnalysisFinding = useAppStore(
    (state) => state.selectAnalysisFinding,
  );
  const [evidence, setEvidence] = useState<
    CpuSourceEvidenceSlice | FindingEvidenceSlice | null
  >(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const sessionsRef = useRef<SessionManifest[]>([]);
  const generationRef = useRef(0);
  const launchButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef(false);
  const requestedFindingRef = useRef<string | null>(null);
  const cardinalityValid = validCardinality(baselineFiles.length) &&
    validCardinality(candidateFiles.length);

  useEffect(() => {
    if (open) {
      const dialog = dialogRef.current;
      if (dialog && !dialog.open) dialog.showModal();
      return;
    }
    if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      launchButtonRef.current?.focus();
    }
  }, [open]);

  const openPanel = () => {
    restoreFocusRef.current = true;
    setOpen(true);
  };

  const closePanel = () => setOpen(false);

  const resetAnalysis = () => {
    clearAnalysisResults();
    setRegressionProjection(null);
    setEvidence(null);
    setAnalyzing(false);
    setEvidenceLoading(false);
  };

  const disposeImported = async () => {
    const sessions = sessionsRef.current;
    const results = await Promise.allSettled(
      sessions.map((session) => engineClient.disposeSession(session.id)),
    );
    const failed = sessions.filter((_, index) => results[index].status === "rejected");
    sessionsRef.current = failed;
    setHasSessions(failed.length > 0);
    if (failed.length > 0) {
      throw new Error(`Failed to dispose ${failed.length} worker session(s)`);
    }
  };

  const reviewExperiment = async () => {
    if (!cardinalityValid || !scenario.trim()) return;
    const generation = ++generationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setImporting(true);
    setManifest(null);
    resetAnalysis();
    setError(null);
    setMessage("Importing traces in the analysis worker");
    setRunProgress([]);

    const loaded: SessionManifest[] = [];
    try {
      await disposeImported();
      const cohorts = [
        { name: "Baseline", files: baselineFiles },
        { name: "Candidate", files: candidateFiles },
      ] as const;
      for (const cohort of cohorts) {
        for (const [index, file] of cohort.files.entries()) {
          const label = `${cohort.name} ${index + 1}`;
          updateRunProgress(setRunProgress, {
            label,
            stage: "queued",
            completed: 0,
            total: 1,
          });
          await nextPaint();
          const session = await engineClient.ingestFile(file, {
            signal: controller.signal,
            onProgress: (next) => {
              const value = { ...next, label };
              setProgress(value);
              updateRunProgress(setRunProgress, value);
            },
          });
          updateRunProgress(setRunProgress, {
            label,
            stage: "complete",
            completed: 1,
            total: 1,
          });
          loaded.push(session);
          sessionsRef.current = [...loaded];
          setHasSessions(true);
        }
      }
      const nextManifest = await engineClient.createExperimentManifest(
        {
          baselineSessionIds: loaded
            .slice(0, baselineFiles.length)
            .map((session) => session.id),
          candidateSessionIds: loaded
            .slice(baselineFiles.length)
            .map((session) => session.id),
          scenario: {
            kind: "marker",
            markerName: scenario.trim(),
            occurrence: 1,
          },
          acceptedDifferences,
          domains: selectedDomains,
        },
        { signal: controller.signal },
      );
      if (generation !== generationRef.current) {
        await disposeImported();
        return;
      }
      setManifest(nextManifest);
      setMessage(
        nextManifest.state === "ready"
          ? "Experiment review complete. Analysis ready."
          : "Experiment review complete. Analysis blocked.",
      );
      setProgress(null);
    } catch (caught) {
      let cleanupFailure: unknown = null;
      try {
        await disposeImported();
      } catch (cleanupError) {
        cleanupFailure = cleanupError;
      }
      if (generation !== generationRef.current) return;
      const originalDetail = describeError(caught);
      const detail = cleanupFailure
        ? `${originalDetail}. ${describeError(cleanupFailure)}`
        : originalDetail;
      if (detail === "Analysis canceled") {
        setMessage("Analysis canceled. Imported worker sessions were disposed.");
      } else {
        setError(detail);
        setMessage(null);
      }
      setProgress(null);
    } finally {
      if (generation === generationRef.current) {
        controllerRef.current = null;
        setImporting(false);
      }
    }
  };

  const cancel = () => {
    const generation = ++generationRef.current;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setImporting(false);
    setManifest(null);
    resetAnalysis();
    setProgress(null);
    setRunProgress((current) =>
      current.map((run) =>
        run.stage === "complete" ? run : { ...run, stage: "canceled" },
      ),
    );
    setMessage("Analysis canceled. Releasing imported worker sessions.");
    void disposeImported()
      .then(() => {
        if (generation === generationRef.current) {
          setMessage("Analysis canceled. Imported worker sessions were disposed.");
        }
      })
      .catch((caught) => {
        if (generation === generationRef.current) setError(describeError(caught));
      });
  };

  const dispose = () => {
    const generation = ++generationRef.current;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setImporting(false);
    setManifest(null);
    resetAnalysis();
    setProgress(null);
    setRunProgress([]);
    setMessage("Disposing experiment from worker memory.");
    void disposeImported()
      .then(() => {
        if (generation === generationRef.current) {
          setMessage("Experiment disposed from worker memory.");
        }
      })
      .catch((caught) => {
        if (generation === generationRef.current) setError(describeError(caught));
      });
  };

  const analyze = async () => {
    if (!manifest?.scope) return;
    const generation = ++generationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setAnalyzing(true);
    setError(null);
    setMessage(`Analyzing ${selectedDomains.map((domain) => DOMAIN_LABELS[domain]).join(", ")} in the worker`);
    setEvidence(null);
    clearAnalysisResults();
    try {
      const nextFindings = await engineClient.analyzeExperiment(manifest.scope, {
        signal: controller.signal,
        onProgress: (next) => {
          setMessage(`Finding analysis: ${next.stage} ${next.completed}/${next.total}`);
        },
      });
      const [nextProjection, nextFindingProjection] = await Promise.all([
        engineClient.requestRegressionProjection(manifest.scope, {
          signal: controller.signal,
        }),
        engineClient.requestFindingProjection(manifest.scope, {
          signal: controller.signal,
        }),
      ]);
      if (generation !== generationRef.current) return;
      setAnalysisResults(manifest.scope, nextFindings);
      setAnalysisFindingProjection(nextFindingProjection);
      setRegressionProjection(nextProjection);
      setView("diff");
      setMessage(
        nextFindings.length > 0
          ? `Selected-domain analysis complete. ${nextFindings.length} ${nextFindings.length === 1 ? "finding" : "findings"} ready.`
          : "No evidence was available in the selected domains.",
      );
    } catch (caught) {
      if (generation !== generationRef.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setMessage(null);
    } finally {
      if (generation === generationRef.current) {
        controllerRef.current = null;
        setAnalyzing(false);
      }
    }
  };

  const selectMark = async (
    mark: RegressionMark,
    updateSharedSelection = true,
  ) => {
    if (!manifest?.scope) return;
    const generation = ++generationRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (updateSharedSelection) {
      selectAnalysisFinding(mark.findingId, mark.evidenceId);
    }
    requestedFindingRef.current = mark.findingId;
    setEvidence(null);
    setEvidenceLoading(true);
    setError(null);
    try {
      const scope = {
        ...manifest.scope,
        selectedFindingId: mark.findingId,
        selectedEvidenceId: mark.evidenceId,
      };
      const slice = mark.kind === "source"
        ? await engineClient.requestTracerEvidence(
            scope,
            mark.findingId,
            mark.evidenceId,
            { signal: controller.signal },
          )
        : await engineClient.requestFindingEvidence(
            scope,
            evidenceSliceQuery({
              findingId: mark.findingId,
              evidenceId: mark.evidenceId,
              contributorId: mark.contributorId,
              include: [
                "contributors",
                "timeline",
                "table",
                "screenshots",
                "provenance",
              ],
              byteBudget: ENGINE_LIMITS.evidenceSliceBytes,
            }),
            { signal: controller.signal },
          );
      if (generation !== generationRef.current) return;
      setEvidence(slice);
    } catch (caught) {
      if (generation !== generationRef.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (generation === generationRef.current) {
        controllerRef.current = null;
        requestedFindingRef.current = null;
        setEvidenceLoading(false);
      }
    }
  };

  const syncSelectedEvidence = useEffectEvent((findingId: string | null) => {
    if (!findingId || evidence?.payload.finding.id === findingId) return;
    setEvidence(null);
    const mark = regressionProjection?.marks.find(
      (candidate) => candidate.findingId === findingId,
    );
    if (!mark || requestedFindingRef.current === findingId) return;
    void selectMark(mark, false);
  });

  useEffect(() => {
    let canceled = false;
    queueMicrotask(() => {
      if (!canceled) syncSelectedEvidence(selectedFindingId);
    });
    return () => {
      canceled = true;
    };
  }, [selectedFindingId]);

  if (!open) {
    return (
      <button
        ref={launchButtonRef}
        type="button"
        className="experiment-launch"
        onClick={openPanel}
      >
        Import experiment
      </button>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="experiment-panel"
      aria-labelledby="experiment-title"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        closePanel();
      }}
    >
      <header className="experiment-panel-header">
        <div>
          <p className="experiment-kicker">Regression lab</p>
          <h1 id="experiment-title">Controlled experiment</h1>
        </div>
        <button
          type="button"
          className="panel-close"
          aria-label="Close experiment import"
          onClick={closePanel}
        >
          close
        </button>
      </header>

      <form
        className="experiment-form"
        onSubmit={(event) => {
          event.preventDefault();
          void reviewExperiment();
        }}
      >
        <label>
          <span>Baseline traces</span>
          <input
            type="file"
            name="baseline-traces"
            accept=".json,.gz"
            multiple
            disabled={importing}
            onChange={(event) => {
              setBaselineFiles([...event.target.files ?? []]);
              setManifest(null);
              resetAnalysis();
            }}
          />
          <small>{cohortGuidance(baselineFiles.length, "Baseline")}</small>
        </label>
        <label>
          <span>Candidate traces</span>
          <input
            type="file"
            name="candidate-traces"
            accept=".json,.gz"
            multiple
            disabled={importing}
            onChange={(event) => {
              setCandidateFiles([...event.target.files ?? []]);
              setManifest(null);
              resetAnalysis();
            }}
          />
          <small>{cohortGuidance(candidateFiles.length, "Candidate")}</small>
        </label>
        <label>
          <span>Scenario marker</span>
          <input
            type="text"
            name="scenario-marker"
            value={scenario}
            required
            disabled={importing}
            onChange={(event) => setScenario(event.target.value)}
          />
        </label>

        <fieldset>
          <legend>Accepted capture differences</legend>
          {CAPTURE_DIFFERENCES.map(({ field, label }) => (
            <label className="experiment-check" key={field}>
              <input
                type="checkbox"
                name={`accepted-${field}`}
                checked={acceptedDifferences.includes(field)}
                disabled={importing}
                onChange={(event) => {
                  setAcceptedDifferences((current) =>
                    event.target.checked
                      ? [...current, field]
                      : current.filter((value) => value !== field),
                  );
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Finding domains</legend>
          {PHASE5_ANALYSIS_DOMAINS.map((domain) => (
            <label className="experiment-check" key={domain}>
              <input
                type="checkbox"
                name={`domain-${domain}`}
                checked={selectedDomains.includes(domain)}
                disabled={importing}
                onChange={(event) => {
                  setSelectedDomains((current) =>
                    event.target.checked
                      ? [...current, domain]
                      : current.filter((value) => value !== domain));
                  setManifest(null);
                  resetAnalysis();
                }}
              />
              <span>{DOMAIN_LABELS[domain]}</span>
            </label>
          ))}
        </fieldset>

        {!cardinalityValid ? (
          <p className="experiment-requirement" role="status">
            Baseline and candidate cohorts each require 3 to 5 traces.
          </p>
        ) : null}

        <div className="experiment-actions">
          <button
            type="submit"
            className="btn experiment-primary"
            disabled={
              !cardinalityValid ||
              !scenario.trim() ||
              selectedDomains.length === 0 ||
              importing
            }
          >
            Review experiment
          </button>
          {cardinalityValid ? (
            <button type="button" className="btn" onClick={cancel}>
              Cancel import
            </button>
          ) : null}
          {hasSessions ? (
            <button type="button" className="btn" onClick={dispose}>
              Dispose experiment
            </button>
          ) : null}
        </div>
      </form>

      <div className="experiment-status" aria-live="polite" aria-atomic="true">
        {message ? <p>{message}</p> : null}
        {progress ? (
          <p>
            {progress.label}: {progress.stage} {progress.completed}/{progress.total}
          </p>
        ) : null}
      </div>
      {runProgress.length > 0 ? (
        <ol className="experiment-progress" aria-label="Import progress">
          {runProgress.map((run) => (
            <li key={run.label}>
              <span>{run.label}</span>
              <span>{run.stage} {run.completed}/{run.total}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {error ? <p className="experiment-error" role="alert">{error}</p> : null}
      {manifest ? <ExperimentManifest manifest={manifest} /> : null}
      {manifest?.state === "ready" ? (
        <button
          type="button"
          className="btn experiment-analyze"
          disabled={analyzing}
          onClick={() => void analyze()}
        >
          Analyze selected domains
        </button>
      ) : null}
      {regressionProjection ? (
        <>
          <FindingsPanel />
          <TracerEvidencePanel
            findings={findings}
            projection={regressionProjection}
            selectedFindingId={selectedFindingId}
            evidence={evidence}
            evidenceLoading={evidenceLoading}
            onSelect={(mark) => void selectMark(mark)}
          />
        </>
      ) : null}
    </dialog>
  );
}

function validCardinality(count: number): boolean {
  return count >= 3 && count <= 5;
}

function cohortGuidance(count: number, label: string): string {
  if (validCardinality(count)) return `${count} traces selected`;
  return `${label} requires 3 to 5 traces; ${count} selected`;
}

function updateRunProgress(
  setRuns: Dispatch<SetStateAction<RunProgress[]>>,
  next: RunProgress,
): void {
  setRuns((current) => {
    const index = current.findIndex((run) => run.label === next.label);
    if (index < 0) return [...current, next];
    return current.map((run, runIndex) => (runIndex === index ? next : run));
  });
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function describeError(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
