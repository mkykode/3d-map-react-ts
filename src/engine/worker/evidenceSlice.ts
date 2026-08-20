import type { AnalysisScope } from "../../domain/analysis";
import type {
  CpuSourceEvidencePayload,
  CpuSourceEvidenceSlice,
  ExactContributor,
  ExactTimelineItem,
  FindingEvidencePayload,
  FindingEvidenceSlice,
} from "../findingContract";
import type { AdapterCanonicalEvidence } from "../adapter";
import type { ScreenshotMeta } from "../types";
import { ENGINE_LIMITS } from "../limits";
import type { EvidenceSliceQuery } from "../../evidence/query";
import type { ExperimentAnalysisResult } from "./analysisResult";
import type { CpuSourceFinding } from "./cpuSourceAnalysis";
import {
  buildCpuSourceProvenance,
  type ProvenanceSessionSource,
} from "./provenance";
import { cpuSourceFindingMatchesScope } from "./regressionProjection";
import { buildRegressionProjection } from "./regressionProjection";
import { encodedJsonBytes } from "./serialization";
import { experimentAnalysisMatchesScope } from "./analysisScope";
import type { CanonicalSessionSource } from "./sessionRepository";
import type { RankedFinding } from "./rankFindings";

export function buildFindingEvidenceSlice(
  analysis: ExperimentAnalysisResult,
  scope: AnalysisScope,
  sessions: CanonicalSessionSource,
  query: EvidenceSliceQuery,
): FindingEvidenceSlice {
  if (!experimentAnalysisMatchesScope(analysis, scope)) {
    throw new Error("Evidence slice scope does not match the active analysis");
  }
  const ranked = analysis.rankedFindings.find(
    (entry) => entry.finding.id === query.findingId,
  );
  if (!ranked || !ranked.finding.evidenceIds.includes(query.evidenceId)) {
    throw new Error(`Finding evidence not found: ${query.findingId}`);
  }
  const projection = buildRegressionProjection(analysis, scope);
  const contributor = projection.contributors[query.contributorId];
  if (
    !contributor ||
    contributor.findingId !== query.findingId ||
    contributor.evidenceId !== query.evidenceId
  ) {
    throw new Error("Regression contributor does not resolve to the requested finding evidence");
  }
  const contributors = exactContributors(ranked.runSamples);
  const sections: FindingEvidencePayload["sections"] = {};
  for (const section of query.include) {
    if (section === "contributors") sections.contributors = contributors;
    if (section === "table") {
      sections.table = contributors.map((entry) => ({
        ...entry,
        unit: ranked.finding.measurement.unit,
      }));
    }
    if (section === "timeline") {
      sections.timeline = exactTimeline(contributors, sessions);
    }
    if (section === "screenshots") {
      sections.screenshots = exactScreenshots(contributors, sessions, scope.timeWindowMs);
    }
    if (section === "provenance") {
      const provenance = analysis.provenanceByFindingId.get(query.findingId);
      if (!provenance) throw new Error(`Finding provenance not found: ${query.findingId}`);
      sections.provenance = provenance;
    }
  }
  const payload: FindingEvidencePayload = {
    finding: ranked.finding,
    contributorId: query.contributorId,
    requested: [...query.include],
    sections,
  };
  const byteLength = encodedJsonBytes(payload);
  if (byteLength > query.byteBudget) {
    throw new Error(
      `Evidence slice byte limit exceeded: ${byteLength} > ${query.byteBudget}; slice was rejected without truncation`,
    );
  }
  return {
    version: 1,
    id: query.evidenceId,
    level: ranked.finding.evidenceLevel,
    availability: ranked.finding.availability,
    unit: ranked.finding.measurement.unit,
    byteLength,
    payload,
  };
}

function exactContributors(
  samples: RankedFinding["runSamples"],
): ExactContributor[] {
  return (["baseline", "candidate"] as const).flatMap((cohort) =>
    samples[cohort].map((run) => ({
      cohort,
      sessionId: run.sessionId,
      value: run.value,
      eventKeys: [...run.eventKeys],
      evidenceState: run.value === null ? "unknown" as const : "observed" as const,
    })));
}

function exactTimeline(
  contributors: readonly ExactContributor[],
  sessions: CanonicalSessionSource,
): NonNullable<FindingEvidencePayload["sections"]["timeline"]> {
  const items: ExactTimelineItem[] = [];
  const gaps: NonNullable<
    FindingEvidencePayload["sections"]["timeline"]
  >["gaps"][number][] = [];
  for (const contributor of contributors) {
    const index = timelineIndex(sessions.getCanonicalForWorker(contributor.sessionId).evidence);
    for (const eventKey of contributor.eventKeys) {
      const event = index.get(eventKey);
      if (!event) {
        gaps.push({
          sessionId: contributor.sessionId,
          eventKey,
          reason: "missing-event",
        });
        continue;
      }
      items.push({
        cohort: contributor.cohort,
        sessionId: contributor.sessionId,
        eventKey,
        ...event,
        unit: "ms",
      });
    }
  }
  return { items, gaps };
}

function timelineIndex(value: unknown): Map<
  string,
  Pick<ExactTimelineItem, "label" | "startMs" | "endMs">
> {
  const evidence = value as AdapterCanonicalEvidence;
  const index = new Map<
    string,
    Pick<ExactTimelineItem, "label" | "startMs" | "endMs">
  >();
  const add = (
    key: string | null | undefined,
    label: string,
    startMs: number,
    endMs: number,
  ) => {
    if (key && !index.has(key)) index.set(key, { label, startMs, endMs });
  };
  for (const event of evidence.events ?? []) {
    add(event.key, event.name, event.startMs, event.startMs + event.durationMs);
  }
  for (const sample of evidence.sourceSamples ?? []) {
    add(
      sample.eventKey,
      sample.frame.functionName,
      sample.startMs,
      sample.startMs + sample.durationMs,
    );
  }
  for (const request of evidence.requests ?? []) {
    add(request.eventKey, `${request.method ?? "UNKNOWN"} ${request.url}`, request.start, request.end);
  }
  for (const frame of evidence.frames ?? []) {
    add(frame.eventKey, frame.dropped ? "Dropped frame" : "Presented frame", frame.start, frame.end);
  }
  for (const metric of evidence.metrics ?? []) {
    add(metric.eventKey, metric.label || metric.name, metric.ts, metric.ts);
  }
  return index;
}

function exactScreenshots(
  contributors: readonly ExactContributor[],
  sessions: CanonicalSessionSource,
  timeWindowMs: AnalysisScope["timeWindowMs"],
): NonNullable<FindingEvidencePayload["sections"]["screenshots"]> {
  return contributors.flatMap((contributor) => {
    const screenshots = sessions.getCanonicalForWorker(contributor.sessionId)
      .screenshots as readonly ScreenshotMeta[];
    return screenshots
      .filter((screenshot) =>
        !timeWindowMs ||
        (screenshot.ts >= timeWindowMs[0] && screenshot.ts <= timeWindowMs[1]))
      .map((screenshot) => ({
        cohort: contributor.cohort,
        sessionId: contributor.sessionId,
        ts: screenshot.ts,
        dataUri: screenshot.dataUri,
      }));
  });
}

export function buildCpuSourceEvidenceSlice(
  result: CpuSourceFinding,
  scope: AnalysisScope,
  sessions: ProvenanceSessionSource,
): CpuSourceEvidenceSlice {
  if (!cpuSourceFindingMatchesScope(result, scope)) {
    throw new Error("Finding does not belong to the requested analysis scope");
  }
  const authoredFallbackUsed = result.source.authored === null;
  const payload: CpuSourceEvidencePayload = {
    finding: result.finding,
    contributors: {
      baseline: result.measurements.baseline.runs,
      candidate: result.measurements.candidate.runs,
    },
    source: {
      sessionId: result.measurements.sourceSessionId,
      cohort: result.measurements.sourceCohort,
      identity: result.source.identity,
      mappingState: result.source.mappingState,
      mappingFailure: result.source.mappingFailure,
      authoredFallbackUsed,
      generated: result.source.generated,
      authored: result.source.authored ?? result.source.generated,
    },
    provenance: buildCpuSourceProvenance(result, scope, sessions),
  };
  const byteLength = encodedJsonBytes(payload);
  if (byteLength > ENGINE_LIMITS.evidenceSliceBytes) {
    throw new Error(
      `Evidence slice byte limit exceeded: ${byteLength} > ${ENGINE_LIMITS.evidenceSliceBytes}`,
    );
  }
  return {
    version: 1,
    id: result.finding.evidenceIds[0],
    level: result.finding.evidenceLevel,
    availability: result.finding.availability,
    unit: "ms",
    byteLength,
    payload,
  };
}
