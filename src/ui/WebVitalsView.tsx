import type { ParsedTraceModel } from "../engine/types";
import {
  summarizeWebVitals,
  type WebVitalMetric,
} from "../engine/vitals";
import { formatMs } from "../scene/layout";
import { useAppStore } from "../state/store";

function MetricCard({
  label,
  metric,
  qualifier,
}: {
  label: string;
  metric: WebVitalMetric;
  qualifier?: string;
}) {
  return (
    <article className={metric.available ? "vital-card available" : "vital-card unavailable"}>
      <div className="vital-card-heading">
        <h2>{label}</h2>
        <span className="vital-status">
          {metric.available ? "Trace marker" : "Unavailable"}
        </span>
      </div>
      {metric.available ? (
        <>
          <strong className="vital-value">{formatMs(metric.valueMs)}</strong>
          <p>{qualifier ?? "after navigation start"}</p>
        </>
      ) : (
        <p className="vital-reason">{metric.reason}</p>
      )}
      <small>{metric.provenance}</small>
    </article>
  );
}

export function WebVitalsView({ model }: { model: ParsedTraceModel }) {
  const summary = summarizeWebVitals(model.markers);
  const setBrush = useAppStore((state) => state.setBrush);
  const setView = useAppStore((state) => state.setView);
  const setZoomed = useAppStore((state) => state.setZoomed);

  const focusWindow = (window: [number, number]) => {
    setBrush(window);
    setZoomed(false);
    setView("terrain");
  };

  return (
    <main className="vitals-workspace" aria-labelledby="vitals-title">
      <header className="vitals-header">
        <div>
          <p className="vitals-kicker">First navigation in this trace</p>
          <h1 id="vitals-title">Web Vitals and critical rendering</h1>
          <p>
            Lab trace evidence only. Available values come from Chrome trace
            markers; unsupported metrics remain explicitly unavailable.
          </p>
        </div>
        <div className="vitals-baseline">
          <span>Navigation start</span>
          <strong>
            {summary.navigationStart === null
              ? "Unavailable"
              : formatMs(summary.navigationStart)}
          </strong>
          <small>relative to trace start</small>
        </div>
      </header>

      <div className="vitals-grid">
        <MetricCard
          label="LCP candidate"
          metric={summary.metrics.lcp}
          qualifier="after navigation start; latest candidate in scope"
        />
        <MetricCard label="CLS" metric={summary.metrics.cls} />
        <MetricCard label="INP" metric={summary.metrics.inp} />
        <MetricCard label="FCP" metric={summary.metrics.fcp} />
      </div>

      <div className="vitals-detail-grid">
        <article className="vitals-path">
          <p className="vitals-kicker">Critical interval</p>
          <h2>Navigation start to LCP candidate</h2>
          <p>
            Focus the period where discovery, network delivery, main-thread
            work, and presentation can delay the largest contentful paint.
            This is a time interval, not yet a causal-path claim.
          </p>
          <button
            type="button"
            className="btn vital-action"
            disabled={!summary.criticalWindow}
            onClick={() => {
              if (summary.criticalWindow) focusWindow(summary.criticalWindow);
            }}
          >
            Focus critical rendering interval
          </button>
        </article>

        <article className="vitals-milestones">
          <p className="vitals-kicker">Navigation milestones</p>
          <h2>Load progression</h2>
          <dl>
            <div>
              <dt>DOMContentLoaded</dt>
              <dd>
                {summary.milestones.domContentLoaded === null
                  ? "Unavailable"
                  : formatMs(summary.milestones.domContentLoaded)}
              </dd>
            </div>
            <div>
              <dt>Load</dt>
              <dd>
                {summary.milestones.load === null
                  ? "Unavailable"
                  : formatMs(summary.milestones.load)}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            className="btn vital-action secondary"
            disabled={!summary.loadWindow}
            onClick={() => {
              if (summary.loadWindow) focusWindow(summary.loadWindow);
            }}
          >
            Focus navigation to load
          </button>
        </article>
      </div>
    </main>
  );
}
