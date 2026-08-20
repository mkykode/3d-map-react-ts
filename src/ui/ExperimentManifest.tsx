import type { ExperimentManifest as ExperimentManifestData } from "../engine/experimentContract";
import { CaptureCoverage } from "./CaptureCoverage";
import { capitalize } from "./presentationFormatting";

export function ExperimentManifest({
  manifest,
}: {
  manifest: ExperimentManifestData;
}) {
  return (
    <section className="experiment-review" aria-labelledby="experiment-review-title">
      <header>
        <p className="experiment-kicker">Worker review</p>
        <h2 id="experiment-review-title">
          {manifest.state === "ready" ? "Analysis ready" : "Analysis blocked"}
        </h2>
      </header>

      {manifest.issues.length > 0 ? (
        <div className="experiment-issues" role="alert">
          {manifest.issues.map((issue) => (
            <p key={`${issue.code}-${issue.detail}`}>
              <strong>{issue.code}</strong>: {issue.detail}
            </p>
          ))}
        </div>
      ) : null}

      <CaptureCoverage manifest={manifest} />

      {manifest.differences.length > 0 ? (
        <section aria-labelledby="capture-differences-title">
          <h3 id="capture-differences-title">Capture differences</h3>
          <ul className="capture-differences">
            {manifest.differences.map((difference) => (
              <li key={difference.field}>
                <strong>{difference.field}</strong>: {difference.values.map((value) => value.value).join(" / ")}
                {difference.accepted ? " (accepted)" : " (unresolved)"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ol className="experiment-runs" aria-label="Labeled experiment runs">
        {manifest.runs.map((run) => (
          <li key={run.sessionId}>
            <span>{capitalize(run.label)}</span>
            <span>{run.scenarioAvailable ? "scenario matched" : "scenario missing"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
