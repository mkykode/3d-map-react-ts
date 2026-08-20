import type { Finding, FindingId } from "../domain/analysis";
import { Canvas } from "@react-three/fiber";
import type {
  CpuSourceEvidenceSlice,
  FindingEvidenceSlice,
} from "../engine/findingContract";
import type {
  RegressionMark,
  RegressionProjection,
} from "../engine/findingContract";
import {
  formatMeasurementDelta,
  formatMeasurementNumber,
  formatMeasurementValue,
  formatPercent,
} from "./measurementFormatting";
import { capitalize, formatScenario } from "./presentationFormatting";
import { AvailabilityNotice } from "./AvailabilityNotice";
import { AuthoredSourceSnippet } from "./AuthoredSourceSnippet";
import { EvidenceLevelBadge } from "./EvidenceLevelBadge";
import { GeneratedSourceSnippet } from "./GeneratedSourceSnippet";
import { RegressionScene } from "../scene/RegressionScene";
import { SURFACE } from "../scene/layout";
import { RenderActivity } from "../scene/RenderActivity";

export function TracerEvidencePanel({
  findings,
  projection,
  selectedFindingId,
  evidence,
  evidenceLoading,
  onSelect,
}: {
  findings: readonly Finding[];
  projection: RegressionProjection;
  selectedFindingId: FindingId | null;
  evidence: CpuSourceEvidenceSlice | FindingEvidenceSlice | null;
  evidenceLoading: boolean;
  onSelect: (mark: RegressionMark) => void;
}) {
  const summaryFinding = findings.find(
    (finding) => finding.id === selectedFindingId,
  ) ?? findings[0] ?? null;
  return (
    <section className="tracer-evidence" aria-labelledby="tracer-evidence-title">
      <header>
        <p className="experiment-kicker">Primary 3D stage</p>
        <h2 id="tracer-evidence-title">Regression overview</h2>
      </header>
      <p>
        {projection.marks.length} bounded marks. Each lane declares its own unit and scale;
        gaps remain unconnected.
      </p>
      {summaryFinding ? <FindingSummary finding={summaryFinding} /> : null}
      <div className="tracer-stage">
        <Canvas
          id="regression-camera"
          role="img"
          aria-label={regressionGraphicLabel(projection.marks)}
          camera={{ position: [16, 12, 18], fov: 42 }}
          frameloop="demand"
          dpr={[1, 1.5]}
        >
          <color attach="background" args={[SURFACE]} />
          <ambientLight intensity={1.2} />
          <directionalLight position={[8, 14, 10]} intensity={1.6} />
          <RenderActivity hostId="regression-camera" />
          <RegressionScene
            projection={projection}
            selectedFindingId={selectedFindingId}
            onSelect={onSelect}
            hostId="regression-camera"
          />
        </Canvas>
      </div>
      <div className="tracer-mark-actions">
        {projection.marks.map((mark) => (
          <button
            type="button"
            className={selectedFindingId === mark.findingId ? "btn active" : "btn"}
            aria-pressed={selectedFindingId === mark.findingId}
            key={mark.findingId}
            onClick={() => onSelect(mark)}
          >
            Select regression mark {mark.title}
          </button>
        ))}
      </div>
      {findings.length === 0 ? (
        <AvailabilityNotice
          availability={{
            state: "unavailable",
            reason: "missing-trace-data",
            detail: "No CPU/source-frame evidence was present in the selected experiment.",
          }}
        />
      ) : null}
      <p className="tracer-status" role="status" aria-atomic="true">
        {evidenceLoading
          ? "Loading exact evidence..."
          : evidence
            ? `Exact evidence loaded for ${evidence.payload.finding.title}.`
            : ""}
      </p>
      {evidence
        ? isCpuSourceEvidence(evidence)
          ? <CpuSourceExactEvidence evidence={evidence} />
          : <FindingExactEvidence evidence={evidence} />
        : null}
    </section>
  );
}

function CpuSourceExactEvidence({ evidence }: { evidence: CpuSourceEvidenceSlice }) {
  const payload = evidence.payload;
  return (
    <div className="exact-evidence">
      <EvidenceLevelBadge level={evidence.level} />
      {evidence.availability.state === "unavailable" ? (
        <AvailabilityNotice availability={evidence.availability} />
      ) : null}
      <table aria-label="Exact cohort contributors">
        <thead>
          <tr>
            <th scope="col">Cohort</th>
            <th scope="col">Run</th>
            <th scope="col">Self time</th>
            <th scope="col">Event keys</th>
          </tr>
        </thead>
        <tbody>
          {(["baseline", "candidate"] as const).flatMap((cohort) =>
            payload.contributors[cohort].map((run, index) => (
              <tr key={run.sessionId}>
                <th scope="row">{capitalize(cohort)} {index + 1}</th>
                <td>{run.sessionId}</td>
                <td>{formatMeasurementValue(run.valueMs, "ms")}</td>
                <td>{run.eventKeys.length > 0 ? run.eventKeys.join(", ") : "Unavailable"}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      <GeneratedSourceSnippet source={payload.source.generated} />
      <p className="source-position">
        Source content from {capitalize(payload.source.cohort)} run {payload.source.sessionId}
      </p>
      <AuthoredSourceSnippet
        source={payload.source.authored}
        fallbackUsed={payload.source.authoredFallbackUsed}
        mappingFailure={payload.source.mappingFailure}
      />
      <details className="tracer-provenance">
        <summary>Exact provenance</summary>
        <p>
          {payload.provenance.derivation.version} | {payload.provenance.runs.length} runs | {payload.provenance.source.mappingState}
        </p>
        <p>{formatScenario(payload.provenance.scope.scenario)}</p>
        <p>
          Time window {payload.provenance.scope.timeWindowMs
            ? `${formatMeasurementNumber(payload.provenance.scope.timeWindowMs[0])}-${formatMeasurementNumber(payload.provenance.scope.timeWindowMs[1])} ms`
            : "selected scenario bounds per run"}
        </p>
        <dl className="tracer-parameters">
          {Object.entries(payload.provenance.derivation.parameters).map(([name, value]) => (
            <div key={name}>
              <dt>{name}:</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
        <ul>
          {payload.provenance.runs.map((run) => (
            <li key={run.sessionId}>
              {run.sessionId}: import {run.importSha256}, payload {run.payloadSha256}. Event keys {run.eventKeys.length > 0 ? run.eventKeys.join(", ") : "unavailable"}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function FindingExactEvidence({ evidence }: { evidence: FindingEvidenceSlice }) {
  const sections = evidence.payload.sections;
  return (
    <div className="exact-evidence">
      <EvidenceLevelBadge level={evidence.level} />
      {evidence.availability.state === "unavailable" ? (
        <AvailabilityNotice availability={evidence.availability} />
      ) : null}
      {sections.table ? (
        <table aria-label="Exact cohort contributors">
          <thead>
            <tr>
              <th scope="col">Cohort</th>
              <th scope="col">Run</th>
              <th scope="col">Value</th>
              <th scope="col">Event keys</th>
            </tr>
          </thead>
          <tbody>
            {(["baseline", "candidate"] as const).flatMap((cohort) =>
              sections.table
                ?.filter((run) => run.cohort === cohort)
                .map((run, index) => (
                  <tr key={`${run.cohort}:${run.sessionId}`}>
                    <th scope="row">{capitalize(run.cohort)} {index + 1}</th>
                    <td>{run.sessionId}</td>
                    <td>{formatMeasurementValue(run.value, run.unit)}</td>
                    <td>{run.eventKeys.length > 0 ? run.eventKeys.join(", ") : "Unavailable"}</td>
                  </tr>
                )) ?? [],
            )}
          </tbody>
        </table>
      ) : null}
      {sections.timeline ? (
        <p>
          Exact timeline: {sections.timeline.items.length} events. {sections.timeline.gaps.length}
          {" "}{sections.timeline.gaps.length === 1 ? "gap" : "gaps"} explicitly unresolved.
        </p>
      ) : null}
      {sections.screenshots ? (
        <p>{sections.screenshots.length} exact screenshots are available in this slice.</p>
      ) : null}
      {sections.provenance ? (
        <details className="tracer-provenance">
          <summary>Exact provenance</summary>
          <p>
            {sections.provenance.derivation.version} | {sections.provenance.runs.length} runs
          </p>
          <p>{formatScenario(sections.provenance.scope.scenario)}</p>
          <ul>
            {sections.provenance.runs.map((run) => (
              <li key={run.sessionId}>
                {run.sessionId}: import {run.importSha256}, payload {run.payloadSha256}.
                Event keys {run.eventKeys.length > 0 ? run.eventKeys.join(", ") : "unavailable"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function FindingSummary({ finding }: { finding: Finding }) {
  const measurement = finding.measurement;
  return (
    <dl className="tracer-summary">
      <div><dt>Status</dt><dd>{finding.status}</dd></div>
      <div><dt>Baseline</dt><dd>{formatGraphicValue(measurement.baseline)}</dd></div>
      <div><dt>Candidate</dt><dd>{formatGraphicValue(measurement.candidate)}</dd></div>
      <div><dt>Absolute delta</dt><dd>{formatGraphicDelta(measurement.absoluteDelta)}</dd></div>
      <div>
        <dt>Relative delta</dt>
        <dd>{measurement.relativeDelta === null ? "unknown" : formatPercent(measurement.relativeDelta)}</dd>
      </div>
      <div><dt>Dispersion</dt><dd>{formatGraphicValue(measurement.dispersion)}</dd></div>
      <div>
        <dt>Completeness</dt>
        <dd>Baseline {formatPercent(measurement.baselineCompleteness)} · Candidate {formatPercent(measurement.candidateCompleteness)}</dd>
      </div>
      <div>
        <dt>Samples</dt>
        <dd>{measurement.baselineSamples} baseline · {measurement.candidateSamples} candidate</dd>
      </div>
    </dl>
  );
}

function regressionGraphicLabel(marks: readonly RegressionMark[]): string {
  if (marks.length === 0) return "3D regression overview. No marks available.";
  return `3D multi-domain regression overview. ${marks.map((mark) =>
    `${mark.kind} ${mark.title}: ${mark.status}; baseline ${formatMeasurementValue(mark.baselineValue, mark.unit, "unknown")}; candidate ${formatMeasurementValue(mark.candidateValue, mark.unit, "unknown")}; delta ${formatMeasurementDelta(mark.absoluteDelta, mark.unit, "unknown")}; scale ${mark.scaleId}${mark.gap ? `; gap ${mark.gap.reason}` : ""}`
  ).join(". ")}.`;
}

function isCpuSourceEvidence(
  evidence: CpuSourceEvidenceSlice | FindingEvidenceSlice,
): evidence is CpuSourceEvidenceSlice {
  return "source" in evidence.payload;
}

function formatGraphicValue(value: number | null): string {
  return formatMeasurementValue(value, "ms", "unknown");
}

function formatGraphicDelta(value: number | null): string {
  return formatMeasurementDelta(value, "ms", "unknown");
}
