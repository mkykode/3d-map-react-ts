import type { ExperimentManifest } from "../engine/experimentContract";

export function CaptureCoverage({ manifest }: { manifest: ExperimentManifest }) {
  const totalRuns = manifest.coverage.baselineRuns + manifest.coverage.candidateRuns;
  return (
    <section className="capture-coverage" aria-labelledby="capture-coverage-title">
      <h3 id="capture-coverage-title">Capture coverage</h3>
      <dl>
        <div>
          <dt>Ready</dt>
          <dd>{manifest.coverage.readyRuns} of {totalRuns} runs ready</dd>
        </div>
        <div>
          <dt>Scenario</dt>
          <dd>{manifest.coverage.scenarioRuns} of {totalRuns} runs aligned</dd>
        </div>
        <div>
          <dt>Hashes</dt>
          <dd>{manifest.coverage.hashRuns} of {totalRuns} runs verified</dd>
        </div>
        <div>
          <dt>Worker memory</dt>
          <dd>
            {formatBytes(manifest.memory.totalBytes)} of {formatBytes(manifest.memory.limitBytes)}
          </dd>
        </div>
      </dl>
      <p>Missing evidence remains unknown and is never counted as zero.</p>
    </section>
  );
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 ** 2).toFixed(bytes >= 100 * 1024 ** 2 ? 0 : 1)} MiB`;
}
