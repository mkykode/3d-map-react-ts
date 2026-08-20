import type { FindingDetail } from "../engine/findingContract";
import { capitalize, formatScenario } from "./presentationFormatting";

export function FindingProvenance({ detail }: { detail: FindingDetail }) {
  const provenance = detail.provenance;
  return (
    <section className="finding-provenance" aria-labelledby="finding-provenance-title">
      <header>
        <p className="experiment-kicker">Audit trail</p>
        <h3 id="finding-provenance-title">Exact finding provenance</h3>
      </header>
      <dl className="finding-provenance-scope">
        <div><dt>Finding ID</dt><dd>{detail.finding.id}</dd></div>
        <div><dt>Evidence IDs</dt><dd>{detail.finding.evidenceIds.join(", ")}</dd></div>
        <div><dt>Scenario</dt><dd>{formatScenario(provenance.scope.scenario)}</dd></div>
        <div>
          <dt>Time window</dt>
          <dd>{provenance.scope.timeWindowMs
            ? `${provenance.scope.timeWindowMs[0]}-${provenance.scope.timeWindowMs[1]} ms`
            : "Selected scenario bounds per run"}</dd>
        </div>
        <div><dt>Derivation</dt><dd>{provenance.derivation.version}</dd></div>
        <div>
          <dt>Mapping state</dt>
          <dd>{provenance.source?.mappingState ?? "Not applicable"}</dd>
        </div>
      </dl>
      <h4>Algorithm parameters</h4>
      <dl className="finding-provenance-parameters">
        {Object.entries(provenance.derivation.parameters).map(([name, value]) => (
          <div key={name}><dt>{name}</dt><dd>{String(value)}</dd></div>
        ))}
      </dl>
      <div className="finding-provenance-runs" role="group" aria-label="Exact run provenance">
        {provenance.runs.map((run) => (
          <article key={`${run.cohort}:${run.sessionId}`}>
            <h4>{capitalize(run.cohort)} · {run.sessionId}</h4>
            <dl>
              <div><dt>Import SHA-256</dt><dd>{run.importSha256}</dd></div>
              <div><dt>Payload SHA-256</dt><dd>{run.payloadSha256}</dd></div>
              <div><dt>Evidence state</dt><dd>{run.evidenceState}</dd></div>
              <div>
                <dt>Event identities</dt>
                <dd>{run.eventKeys.length > 0 ? run.eventKeys.join(", ") : "Unavailable"}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
