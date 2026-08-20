import { startTransition, useEffect, useState } from "react";
import type { Finding } from "../domain/analysis";
import { engineClient } from "../engine/engineClient";
import { useAppStore } from "../state/store";
import { FindingProvenance } from "./FindingProvenance";
import {
  formatMeasurementDelta,
  formatMeasurementValue,
  formatPercent,
} from "./measurementFormatting";
import { capitalize } from "./presentationFormatting";

const QUALITY_LABELS: Record<Finding["evidenceQuality"]["class"], string> = {
  "authored-source": "Authored source",
  "generated-source": "Generated source",
  "stable-non-source-identity": "Stable semantic identity",
  unmatched: "Unmatched evidence",
};

const PROMOTION_REASON_LABELS: Record<
  Finding["promotion"]["reasons"][number],
  string
> = {
  "insufficient-samples": "Fewer than 3 measured runs in a cohort",
  "non-positive-effect": "Effect is not positive",
  "effect-within-dispersion": "Effect does not exceed 2x dispersion",
  "incomplete-identity": "Semantic identity is incomplete",
};

export function FindingsPanel() {
  const findings = useAppStore((state) => state.analysisFindings);
  const scope = useAppStore((state) => state.analysisScope);
  const detail = useAppStore((state) => state.analysisFindingDetail);
  const selectFinding = useAppStore((state) => state.selectAnalysisFinding);
  const setDetail = useAppStore((state) => state.setAnalysisFindingDetail);
  const setView = useAppStore((state) => state.setView);
  const [detailFailure, setDetailFailure] = useState<{
    findingId: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!scope?.selectedFindingId) return;
    const controller = new AbortController();
    void engineClient.requestFindingDetail(
      scope,
      scope.selectedFindingId,
      { signal: controller.signal },
    ).then((nextDetail) => {
      startTransition(() => {
        setDetail(nextDetail);
      });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setDetailFailure({
        findingId: scope.selectedFindingId as string,
        message: error instanceof Error ? error.message : String(error),
      });
    });
    return () => controller.abort();
  }, [scope, setDetail]);

  if (!scope || findings.length === 0) return null;

  return (
    <section className="findings-panel" aria-labelledby="findings-title">
      <header className="findings-header">
        <div>
          <p className="experiment-kicker">Cohort signal</p>
          <h2 id="findings-title">Ranked findings</h2>
        </div>
        <span>{findings.length} {findings.length === 1 ? "finding" : "findings"}</span>
      </header>
      <ol className="findings-list">
        {findings.map((finding) => (
          <li
            key={finding.id}
            className={`finding-card finding-${finding.status}`}
            data-selected={scope.selectedFindingId === finding.id}
          >
            <button
              type="button"
              className="finding-select"
              data-evidence-id={finding.evidenceIds[0]}
              aria-pressed={scope.selectedFindingId === finding.id}
              onClick={() => {
                const evidenceId = finding.evidenceIds[0] ?? null;
                selectFinding(finding.id, evidenceId);
              }}
            >
              <span className="finding-card-heading">
                <strong>{finding.title}</strong>
                <span className="finding-selection-indicator">
                  {scope.selectedFindingId === finding.id ? "Selected" : finding.status}
                </span>
              </span>
              <span className="finding-identity">{formatIdentity(finding)}</span>
              <FindingMeasures finding={finding} />
            </button>
          </li>
        ))}
      </ol>
      {scope.selectedFindingId ? (
        <div className="findings-actions">
          <button type="button" className="btn" onClick={() => setView("diff")}>
            Show selected finding in 3D
          </button>
        </div>
      ) : null}
      <p className="findings-detail-status" role="status" aria-live="polite">
        {detailFailure?.findingId === scope.selectedFindingId
          ? `Finding provenance unavailable: ${detailFailure.message}`
          : detail?.finding.id === scope.selectedFindingId
            ? `Exact provenance loaded for ${detail.finding.title}.`
            : scope.selectedFindingId
              ? "Loading exact finding provenance..."
              : ""}
      </p>
      {detail && detail.finding.id === scope.selectedFindingId
        ? <FindingProvenance detail={detail} />
        : null}
    </section>
  );
}

function formatIdentity(finding: Finding): string {
  if (finding.domain !== "cpu-source") return finding.semanticIdentity;
  const parts = finding.semanticIdentity.split("\u0000");
  if (parts.length < 5) return finding.semanticIdentity;
  const line = Number(parts[3]);
  const column = Number(parts[4]);
  return `${parts[1]}:${Number.isFinite(line) ? line + 1 : "?"}:${
    Number.isFinite(column) ? column + 1 : "?"
  }`;
}

function FindingMeasures({ finding }: { finding: Finding }) {
  const measurement = finding.measurement;
  return (
    <dl className="finding-measures">
      <div><dt>Baseline</dt><dd>{formatMeasurementValue(measurement.baseline, measurement.unit)}</dd></div>
      <div><dt>Candidate</dt><dd>{formatMeasurementValue(measurement.candidate, measurement.unit)}</dd></div>
      <div><dt>Effect</dt><dd>{formatMeasurementDelta(measurement.absoluteDelta, measurement.unit)}</dd></div>
      <div><dt>Relative</dt><dd>{formatRelative(measurement.relativeDelta)}</dd></div>
      <div><dt>Dispersion</dt><dd>{formatMeasurementValue(measurement.dispersion, measurement.unit)}</dd></div>
      <div><dt>Samples</dt><dd>{measurement.baselineSamples} / {measurement.candidateSamples}</dd></div>
      <div>
        <dt>Completeness</dt>
        <dd>{formatPercent(measurement.baselineCompleteness)} / {formatPercent(measurement.candidateCompleteness)}</dd>
      </div>
      <div>
        <dt>Evidence quality</dt>
        <dd>{QUALITY_LABELS[finding.evidenceQuality.class]} ({formatPercent(finding.evidenceQuality.weight)})</dd>
      </div>
      <div className="finding-measure-wide">
        <dt>Missingness</dt>
        <dd>
          {capitalize(finding.missingness.state)} · {finding.missingness.baselineMissing} baseline missing · {finding.missingness.candidateMissing} candidate missing
        </dd>
      </div>
      <div className="finding-measure-wide">
        <dt>Promotion</dt>
        <dd>
          {finding.promotion.eligible
            ? "Promoted"
            : `Not promoted: ${finding.promotion.reasons
                .map((reason) => PROMOTION_REASON_LABELS[reason])
                .join("; ")}`}
        </dd>
      </div>
    </dl>
  );
}

function formatRelative(value: number | null): string {
  if (value === null) return "Unknown";
  return `${value >= 0 ? "+" : ""}${formatPercent(value)}`;
}
