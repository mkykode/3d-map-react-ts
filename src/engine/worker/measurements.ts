import type { AnalysisScope, SessionId } from "../../domain/analysis";
import type { CanonicalSourceSample } from "../adapter";
import type {
  CanonicalSessionData,
  CanonicalSessionSource,
} from "./sessionRepository";
import { resolveAnalysisBounds } from "./analysisBounds";
import {
  resolveTracerSource,
  type EmbeddedResource,
} from "./tracerSource";
import { compareAscii } from "../../lib/stable";
import { visitItemsInterruptibly } from "./collectorAdapters";
import type { TracerSourceResult } from "../findingContract";

export interface CpuSourceRunMeasurement {
  sessionId: SessionId;
  valueMs: number | null;
  eventKeys: readonly string[];
}

export interface CpuSourceCohortMeasurement {
  runs: readonly CpuSourceRunMeasurement[];
  validSamples: number;
  missingSamples: number;
  completeness: number;
}

export interface CpuSourceMeasurement {
  semanticIdentity: string;
  title: string;
  source: TracerSourceResult;
  sourceSessionId: SessionId;
  sourceCohort: "baseline" | "candidate";
  baseline: CpuSourceCohortMeasurement;
  candidate: CpuSourceCohortMeasurement;
}

export type CpuSourceMeasurementSource = CanonicalSessionSource;

interface PresentRunMeasurement {
  valueMs: number;
  eventKeys: readonly string[];
  title: string;
  source: TracerSourceResult;
}

export function collectCpuSourceMeasurements(
  source: CpuSourceMeasurementSource,
  scope: AnalysisScope,
): CpuSourceMeasurement[] {
  const allSessionIds = [
    ...scope.baselineSessionIds,
    ...scope.candidateSessionIds,
  ];
  const bySession = new Map<
    SessionId,
    ReadonlyMap<string, PresentRunMeasurement>
  >();
  const identities = new Map<
    string,
    Pick<PresentRunMeasurement, "title" | "source"> & {
      sourceSessionId: SessionId;
      sourceCohort: "baseline" | "candidate";
    }
  >();
  const candidateIds = new Set(scope.candidateSessionIds);

  for (const id of allSessionIds) {
    const measurements = measurementsForSession(
      source.getCanonicalForWorker(id),
      scope,
    );
    bySession.set(id, measurements);
    for (const [identity, measurement] of measurements) {
      const sourceCohort = candidateIds.has(id) ? "candidate" : "baseline";
      const current = identities.get(identity);
      if (!current || (sourceCohort === "candidate" && current.sourceCohort === "baseline")) {
        identities.set(identity, {
          title: measurement.title,
          source: measurement.source,
          sourceSessionId: id,
          sourceCohort,
        });
      }
    }
  }

  return assembleMeasurements(identities, bySession, scope);
}

export async function collectCpuSourceMeasurementsInterruptibly(
  source: CpuSourceMeasurementSource,
  scope: AnalysisScope,
  checkpoint: (completed: number, total: number) => Promise<void>,
): Promise<CpuSourceMeasurement[]> {
  const allSessionIds = [...scope.baselineSessionIds, ...scope.candidateSessionIds];
  const bySession = new Map<SessionId, ReadonlyMap<string, PresentRunMeasurement>>();
  const identities = new Map<
    string,
    Pick<PresentRunMeasurement, "title" | "source"> & {
      sourceSessionId: SessionId;
      sourceCohort: "baseline" | "candidate";
    }
  >();
  const candidateIds = new Set(scope.candidateSessionIds);
  for (const [index, id] of allSessionIds.entries()) {
    const measurements = await measurementsForSessionInterruptibly(
      source.getCanonicalForWorker(id),
      scope,
      checkpoint,
    );
    bySession.set(id, measurements);
    for (const [identity, measurement] of measurements) {
      const sourceCohort = candidateIds.has(id) ? "candidate" : "baseline";
      const current = identities.get(identity);
      if (!current || (sourceCohort === "candidate" && current.sourceCohort === "baseline")) {
        identities.set(identity, {
          title: measurement.title,
          source: measurement.source,
          sourceSessionId: id,
          sourceCohort,
        });
      }
    }
    await checkpoint(index + 1, allSessionIds.length);
  }
  return assembleMeasurements(identities, bySession, scope);
}

async function measurementsForSessionInterruptibly(
  canonical: CanonicalSessionData,
  scope: AnalysisScope,
  checkpoint: (completed: number, total: number) => Promise<void>,
): Promise<ReadonlyMap<string, PresentRunMeasurement>> {
  const sourceSamples = canonicalSourceSampleValues(canonical.evidence);
  const bounds = resolveAnalysisBounds(canonical, scope);
  if (sourceSamples.length === 0 || !bounds) return new Map();
  const resources = canonical.resources.flatMap(embeddedResource);
  const sourceMaps = sourceMapRecord(canonical.sourceMaps);
  const accumulated = measurementAccumulator();
  await visitItemsInterruptibly(sourceSamples, (value) => {
    const sample = canonicalSourceSample(value);
    if (!sample) return;
    accumulateSourceSample(
      accumulated,
      sample,
      bounds,
      resolveSampleSource(sample, resources, sourceMaps),
    );
  }, checkpoint);
  return finishSessionMeasurements(accumulated);
}

function assembleMeasurements(
  identities: ReadonlyMap<
    string,
    Pick<PresentRunMeasurement, "title" | "source"> & {
      sourceSessionId: SessionId;
      sourceCohort: "baseline" | "candidate";
    }
  >,
  bySession: ReadonlyMap<SessionId, ReadonlyMap<string, PresentRunMeasurement>>,
  scope: AnalysisScope,
): CpuSourceMeasurement[] {
  return [...identities]
    .sort(([left], [right]) => compareAscii(left, right))
    .map(([semanticIdentity, identity]) => ({
      semanticIdentity,
      title: identity.title,
      source: identity.source,
      sourceSessionId: identity.sourceSessionId,
      sourceCohort: identity.sourceCohort,
      baseline: cohortMeasurement(
        scope.baselineSessionIds,
        semanticIdentity,
        bySession,
      ),
      candidate: cohortMeasurement(
        scope.candidateSessionIds,
        semanticIdentity,
        bySession,
      ),
    }));
}

function measurementsForSession(
  canonical: CanonicalSessionData,
  scope: AnalysisScope,
): ReadonlyMap<string, PresentRunMeasurement> {
  const prepared = prepareSessionMeasurements(canonical, scope);
  if (!prepared) return new Map();
  const accumulated = measurementAccumulator();
  for (const sample of prepared.sourceSamples) {
    accumulateSourceSample(
      accumulated,
      sample,
      prepared.bounds,
      resolveSampleSource(sample, prepared.resources, prepared.sourceMaps),
    );
  }
  return finishSessionMeasurements(accumulated);
}

type MeasurementAccumulator = Map<string, {
  valueMs: number;
  eventKeys: Set<string>;
  title: string;
  source: TracerSourceResult;
}>;

function prepareSessionMeasurements(canonical: CanonicalSessionData, scope: AnalysisScope) {
  const sourceSamples = canonicalSourceSamples(canonical.evidence);
  const bounds = resolveAnalysisBounds(canonical, scope);
  if (sourceSamples.length === 0 || !bounds) return null;
  return {
    sourceSamples,
    bounds,
    resources: canonical.resources.flatMap(embeddedResource),
    sourceMaps: sourceMapRecord(canonical.sourceMaps),
  };
}

function measurementAccumulator(): MeasurementAccumulator {
  return new Map();
}

function resolveSampleSource(
  sample: CanonicalSourceSample,
  resources: readonly EmbeddedResource[],
  sourceMaps: Readonly<Record<string, string>>,
): TracerSourceResult {
  return resolveTracerSource(
    {
      functionName: sample.frame.functionName,
      scriptId: sample.frame.scriptId,
      generatedUrl: sample.frame.scriptUrl,
      generatedLine: sample.frame.lineNumber,
      generatedColumn: sample.frame.columnNumber,
    },
    resources,
    sourceMaps,
  );
}

function accumulateSourceSample(
  accumulated: MeasurementAccumulator,
  sample: CanonicalSourceSample,
  bounds: readonly [number, number],
  source: TracerSourceResult,
): void {
  if (!overlaps(sample.startMs, sample.durationMs, bounds)) return;
  const semanticIdentity = source.identity.key;
  const current = accumulated.get(semanticIdentity) ?? {
    valueMs: 0,
    eventKeys: new Set<string>(),
    title: source.identity.functionName,
    source,
  };
  current.valueMs += clippedSelfTime(sample, bounds);
  if (sample.eventKey) current.eventKeys.add(sample.eventKey);
  accumulated.set(semanticIdentity, current);
}

function finishSessionMeasurements(
  accumulated: MeasurementAccumulator,
): ReadonlyMap<string, PresentRunMeasurement> {
  return new Map(
    [...accumulated].map(([identity, measurement]) => [
      identity,
      {
        ...measurement,
        eventKeys: [...measurement.eventKeys].sort(compareAscii),
      },
    ]),
  );
}

function overlaps(
  startMs: number,
  durationMs: number,
  bounds: readonly [number, number],
): boolean {
  return startMs < bounds[1] && startMs + Math.max(0, durationMs) > bounds[0];
}

function clippedSelfTime(
  sample: CanonicalSourceSample,
  bounds: readonly [number, number],
): number {
  if (sample.exclusiveSpans.length > 0) {
    let total = 0;
    for (const span of sample.exclusiveSpans) {
      total += overlapDuration(span[0], span[1], bounds);
    }
    return total;
  }

  if (sample.durationMs <= 0) return 0;
  const overlap = overlapDuration(
    sample.startMs,
    sample.startMs + sample.durationMs,
    bounds,
  );
  return sample.selfTimeMs * overlap / sample.durationMs;
}

function overlapDuration(
  startMs: number,
  endMs: number,
  bounds: readonly [number, number],
): number {
  return Math.max(0, Math.min(endMs, bounds[1]) - Math.max(startMs, bounds[0]));
}

function cohortMeasurement(
  sessionIds: readonly SessionId[],
  semanticIdentity: string,
  bySession: ReadonlyMap<
    SessionId,
    ReadonlyMap<string, PresentRunMeasurement>
  >,
): CpuSourceCohortMeasurement {
  const runs = sessionIds.map((sessionId): CpuSourceRunMeasurement => {
    const measurement = bySession.get(sessionId)?.get(semanticIdentity);
    return {
      sessionId,
      valueMs: measurement?.valueMs ?? null,
      eventKeys: measurement?.eventKeys ?? [],
    };
  });
  const validSamples = runs.filter((run) => run.valueMs !== null).length;
  return {
    runs,
    validSamples,
    missingSamples: runs.length - validSamples,
    completeness: runs.length === 0 ? 0 : validSamples / runs.length,
  };
}

function canonicalSourceSamples(value: unknown): CanonicalSourceSample[] {
  return canonicalSourceSampleValues(value).flatMap((value) => {
    const sample = canonicalSourceSample(value);
    return sample ? [sample] : [];
  });
}

function canonicalSourceSampleValues(value: unknown): readonly unknown[] {
  return isRecord(value) && Array.isArray(value.sourceSamples)
    ? value.sourceSamples
    : [];
}

function canonicalSourceSample(sample: unknown): CanonicalSourceSample | null {
  if (
    !isRecord(sample) ||
    !isRecord(sample.frame) ||
    typeof sample.frame.functionName !== "string" ||
    typeof sample.frame.scriptUrl !== "string" ||
    typeof sample.frame.scriptId !== "string" ||
    typeof sample.frame.lineNumber !== "number" ||
    typeof sample.frame.columnNumber !== "number" ||
    typeof sample.startMs !== "number" ||
    typeof sample.durationMs !== "number" ||
    typeof sample.selfTimeMs !== "number" ||
    !Array.isArray(sample.exclusiveSpans)
  ) {
    return null;
  }
  return sample as unknown as CanonicalSourceSample;
}

function embeddedResource(value: unknown): EmbeddedResource[] {
  if (
    !isRecord(value) ||
    typeof value.url !== "string" ||
    typeof value.mimeType !== "string" ||
    typeof value.content !== "string"
  ) {
    return [];
  }
  return [
    {
      url: value.url,
      mimeType: value.mimeType,
      content: value.content,
      sourceMapUrl:
        typeof value.sourceMapUrl === "string" ? value.sourceMapUrl : undefined,
      scriptId: typeof value.scriptId === "string" ? value.scriptId : undefined,
      documentUrl:
        typeof value.documentUrl === "string" ? value.documentUrl : undefined,
    },
  ];
}

function sourceMapRecord(
  sourceMaps: readonly unknown[],
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const sourceMap of sourceMaps) {
    if (
      isRecord(sourceMap) &&
      typeof sourceMap.url === "string" &&
      typeof sourceMap.content === "string"
    ) {
      result[sourceMap.url] = sourceMap.content;
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
