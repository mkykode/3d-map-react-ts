import type { AnalysisScope } from "../../domain/analysis";
import type {
  RegressionMark,
  RegressionProjection,
  RegressionScale,
} from "../findingContract";
import { ENGINE_LIMITS } from "../limits";
import type { CpuSourceFinding } from "./cpuSourceAnalysis";
import { encodedJsonBytes } from "./serialization";
import { compareAscii, sameOrderedValues } from "../../lib/stable";
import type { ExperimentAnalysisResult } from "./analysisResult";

const MARK_KINDS: readonly RegressionMark["kind"][] = [
  "cpu",
  "gpu",
  "network",
  "frame",
  "request",
  "metric",
  "source",
];

export function buildRegressionProjection(
  analysis: Pick<ExperimentAnalysisResult, "scope" | "findings">,
  scope: AnalysisScope,
  maxBytes = ENGINE_LIMITS.projectionBytes,
): RegressionProjection {
  if (!analysisMatchesScope(analysis.scope, scope)) {
    throw new Error("Regression projection scope does not match the active analysis");
  }
  const ordered = analysis.findings
    .map((finding) => ({ finding, kind: markKind(finding.domain, finding.semanticIdentity) }))
    .filter((entry): entry is typeof entry & { kind: RegressionMark["kind"] } =>
      entry.kind !== null)
    .sort((left, right) =>
      MARK_KINDS.indexOf(left.kind) - MARK_KINDS.indexOf(right.kind) ||
      compareAscii(left.finding.semanticIdentity, right.finding.semanticIdentity) ||
      compareAscii(left.finding.id, right.finding.id));
  const scaleMaxima = new Map<string, number>();
  for (const { finding, kind } of ordered) {
    const scaleId = scaleIdFor(kind, finding.measurement.unit);
    scaleMaxima.set(
      scaleId,
      Math.max(
        scaleMaxima.get(scaleId) ?? 0,
        Math.abs(finding.measurement.absoluteDelta ?? 0),
      ),
    );
  }
  const kindRanks = new Map<RegressionMark["kind"], number>();
  const marks = ordered.map(({ finding, kind }) => {
    const kindRank = kindRanks.get(kind) ?? 0;
    kindRanks.set(kind, kindRank + 1);
    return markFor(
      finding,
      kind,
      kindRank,
      scaleMaxima.get(scaleIdFor(kind, finding.measurement.unit)) ?? 0,
    );
  });
  const scales = Object.fromEntries(
    [...scaleMaxima].sort(([left], [right]) => compareAscii(left, right)).map(
      ([id, maxAbsoluteDelta]) => {
        const mark = marks.find((candidate) => candidate.scaleId === id);
        if (!mark) throw new Error(`Regression scale has no mark: ${id}`);
        return [id, scaleFor(mark, maxAbsoluteDelta)];
      },
    ),
  );
  const contributors = Object.fromEntries(marks.map((mark) => [
    mark.contributorId,
    { findingId: mark.findingId, evidenceId: mark.evidenceId },
  ]));
  const payload = {
    version: 1 as const,
    layout: "multi-domain-regression-v1" as const,
    scenario: scope.scenario,
    marks,
    scales,
    contributors,
    edges: [] as const,
  };
  const byteLength = encodedJsonBytes(payload);
  if (byteLength > maxBytes) {
    throw new Error(
      `Regression projection byte limit exceeded: ${byteLength} > ${maxBytes}`,
    );
  }
  return { ...payload, byteLength };
}

function analysisMatchesScope(left: AnalysisScope, right: AnalysisScope): boolean {
  return sameOrderedValues(left.baselineSessionIds, right.baselineSessionIds) &&
    sameOrderedValues(left.candidateSessionIds, right.candidateSessionIds) &&
    JSON.stringify(left.scenario) === JSON.stringify(right.scenario) &&
    JSON.stringify(left.timeWindowMs) === JSON.stringify(right.timeWindowMs) &&
    sameOrderedValues(left.domains, right.domains);
}

export function cpuSourceFindingMatchesScope(
  result: CpuSourceFinding,
  scope: AnalysisScope,
): boolean {
  if (
    !sameOrderedValues(
      result.measurements.baseline.runs.map((run) => run.sessionId),
      scope.baselineSessionIds,
    ) ||
    !sameOrderedValues(
      result.measurements.candidate.runs.map((run) => run.sessionId),
      scope.candidateSessionIds,
    )
  ) {
    return false;
  }
  return result.scope === null || (
    JSON.stringify(result.scope.scenario) === JSON.stringify(scope.scenario) &&
    JSON.stringify(result.scope.timeWindowMs) === JSON.stringify(scope.timeWindowMs)
  );
}

function markFor(
  finding: ExperimentAnalysisResult["findings"][number],
  kind: RegressionMark["kind"],
  kindRank: number,
  maxAbsoluteDelta: number,
): RegressionMark {
  const evidenceId = finding.evidenceIds[0];
  if (!evidenceId) throw new Error(`Finding has no stable evidence identity: ${finding.id}`);
  const delta = Math.abs(finding.measurement.absoluteDelta ?? 0);
  const ratio = maxAbsoluteDelta === 0 ? 0 : delta / maxAbsoluteDelta;
  const height = 1 + Math.min(11, ratio * 11);
  const lane = MARK_KINDS.indexOf(kind);
  const below = finding.status === "improvement" || finding.status === "removed";
  const contributorId = [
    "contributor:v1",
    encodeURIComponent(finding.id),
    encodeURIComponent(evidenceId),
    kind,
  ].join(":");
  return {
    findingId: finding.id,
    evidenceId,
    contributorId,
    kind,
    domain: finding.domain,
    semanticIdentity: finding.semanticIdentity,
    title: finding.title,
    unit: finding.measurement.unit,
    scaleId: scaleIdFor(kind, finding.measurement.unit),
    baselineValue: finding.measurement.baseline,
    candidateValue: finding.measurement.candidate,
    absoluteDelta: finding.measurement.absoluteDelta,
    status: finding.status,
    availability: finding.availability,
    gap: gapFor(finding),
    position: [kindRank * 8 + 4, below ? -height / 2 : height / 2, lane * 10],
    size: [6, height, 7],
  };
}

function markKind(
  domain: ExperimentAnalysisResult["findings"][number]["domain"],
  semanticIdentity: string,
): RegressionMark["kind"] | null {
  if (domain === "cpu-source") return "source";
  if (domain === "browser") {
    return semanticIdentity === "browser-domain:gpu" ? "gpu" : "cpu";
  }
  if (domain === "network") {
    return semanticIdentity.startsWith("request:") ? "request" : "network";
  }
  if (domain === "frame") return "frame";
  if (domain === "metric") return "metric";
  return null;
}

function scaleIdFor(
  kind: RegressionMark["kind"],
  unit: RegressionMark["unit"],
): string {
  return `scale:v1:${kind}-${unit}`;
}

function scaleFor(mark: RegressionMark, maxAbsoluteDelta: number): RegressionScale {
  return {
    id: mark.scaleId,
    kind: "linear",
    markKind: mark.kind,
    unit: mark.unit,
    label: `${mark.kind} delta (${mark.unit})`,
    maxAbsoluteDelta,
  };
}

function gapFor(
  finding: ExperimentAnalysisResult["findings"][number],
): RegressionMark["gap"] {
  if (finding.status === "unmatched") {
    return {
      state: "gap",
      reason: "unsupported-join",
      detail: "No stable semantic identity joins this contributor across cohorts.",
    };
  }
  if (finding.availability.state === "unavailable") {
    return {
      state: "gap",
      reason: "unavailable",
      detail: finding.availability.detail,
    };
  }
  if (
    finding.measurement.baseline === null ||
    finding.measurement.candidate === null
  ) {
    return {
      state: "gap",
      reason: "missing-contributor",
      detail: "One cohort has no observed contributor value; the gap remains unknown.",
    };
  }
  return null;
}
