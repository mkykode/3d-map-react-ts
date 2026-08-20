export interface RankedTarget {
  targetId: string;
  score: number;
}

export interface TopThreeScore {
  correct: boolean;
  matchedRank: 1 | 2 | 3 | null;
  rankedTargetIds: readonly string[];
}

export interface SuperiorityResult {
  traceTopography: { correct: number; total: number; accuracy: number };
  devTools: { correct: number; total: number; accuracy: number };
  absoluteAccuracyDelta: number;
  gate: "pass" | "fail-tie" | "fail-lower";
}

export interface ProtocolBundleSummary {
  protocolId: string;
  corpusId: string;
  caseCount: number;
  envelopeCount: number;
  commitment: string;
  estimatorPolicyId: string;
}

export interface BenchmarkResultRecord {
  schemaVersion: 1;
  protocolId: string;
  corpusId: string;
  commitmentSha256: string;
  startedAt: string;
  completedAt: string;
  participantCount: number;
  excludedParticipantCount: number;
  caseExposureCountPerTool: number;
  traceTopographyCorrect: number;
  devToolsCorrect: number;
  traceTopographyAccuracy: number;
  devToolsAccuracy: number;
  absoluteAccuracyDelta: number;
  superiorityGate: SuperiorityResult["gate"];
  medianDiagnosisTimeMsByTool: Readonly<Record<"trace-topography" | "devtools", number>>;
  unsupportedClaimCountByTool: Readonly<Record<"trace-topography" | "devtools", number>>;
  failureCountByTool: Readonly<Record<"trace-topography" | "devtools", number>>;
  exclusions: readonly { code: string; count: number }[];
}

export const BENCHMARK_RESULT_FIELDS = [
  "schemaVersion",
  "protocolId",
  "corpusId",
  "commitmentSha256",
  "startedAt",
  "completedAt",
  "participantCount",
  "excludedParticipantCount",
  "caseExposureCountPerTool",
  "traceTopographyCorrect",
  "devToolsCorrect",
  "traceTopographyAccuracy",
  "devToolsAccuracy",
  "absoluteAccuracyDelta",
  "superiorityGate",
  "medianDiagnosisTimeMsByTool",
  "unsupportedClaimCountByTool",
  "failureCountByTool",
  "exclusions",
] as const satisfies readonly (keyof BenchmarkResultRecord)[];

export function rankTopThree(ranking: readonly RankedTarget[]): RankedTarget[] {
  const seen = new Set<string>();
  for (const target of ranking) {
    if (!target.targetId || !Number.isFinite(target.score)) {
      throw new Error("Ranked targets require a non-empty ID and finite score");
    }
    if (seen.has(target.targetId)) {
      throw new Error(`Duplicate ranked target: ${target.targetId}`);
    }
    seen.add(target.targetId);
  }
  return [...ranking]
    .sort(
      (left, right) =>
        right.score - left.score || compareAscii(left.targetId, right.targetId),
    )
    .slice(0, 3);
}

export function scoreTopThree(
  ranking: readonly RankedTarget[],
  acceptedTargetIds: readonly string[],
): TopThreeScore {
  if (acceptedTargetIds.length === 0 || acceptedTargetIds.some((id) => !id)) {
    throw new Error("Scoring requires at least one sealed target or alias ID");
  }
  const accepted = new Set(acceptedTargetIds);
  const ranked = rankTopThree(ranking);
  const matchedIndex = ranked.findIndex((target) => accepted.has(target.targetId));
  return {
    correct: matchedIndex >= 0,
    matchedRank: matchedIndex >= 0 ? ((matchedIndex + 1) as 1 | 2 | 3) : null,
    rankedTargetIds: ranked.map((target) => target.targetId),
  };
}

export function evaluateSuperiority(outcomes: {
  traceTopography: readonly boolean[];
  devTools: readonly boolean[];
}): SuperiorityResult {
  if (
    outcomes.traceTopography.length === 0 ||
    outcomes.traceTopography.length !== outcomes.devTools.length
  ) {
    throw new Error("Superiority requires equal, non-empty scored exposures per tool");
  }
  const traceTopography = summarizeOutcomes(outcomes.traceTopography);
  const devTools = summarizeOutcomes(outcomes.devTools);
  const absoluteAccuracyDelta = traceTopography.accuracy - devTools.accuracy;
  return {
    traceTopography,
    devTools,
    absoluteAccuracyDelta,
    gate:
      absoluteAccuracyDelta > 0
        ? "pass"
        : absoluteAccuracyDelta === 0
          ? "fail-tie"
          : "fail-lower",
  };
}

export function validateProtocolBundle(bundle: {
  preregistration: unknown;
  estimatorPolicy: unknown;
  tuningManifest: unknown;
  knownRegressions: unknown;
  heldOutIndex: unknown;
  commitment: string;
}): ProtocolBundleSummary {
  const preregistration = asRecord(bundle.preregistration, "preregistration");
  const estimatorPolicy = asRecord(bundle.estimatorPolicy, "estimator policy");
  const tuningManifest = asRecord(bundle.tuningManifest, "tuning manifest");
  const knownRegressions = asRecord(
    bundle.knownRegressions,
    "known regressions manifest",
  );
  const heldOutIndex = asRecord(bundle.heldOutIndex, "held-out index");
  const heldOutPolicy = asRecord(preregistration.heldOut, "held-out policy");
  const scoring = asRecord(preregistration.scoring, "scoring policy");
  const study = asRecord(preregistration.studyDesign, "study design");
  const training = asRecord(study.training, "training policy");
  const groundTruth = asRecord(preregistration.groundTruth, "ground-truth policy");

  expectEqual(preregistration.schemaVersion, 1, "preregistration schema version");
  expectEqual(preregistration.status, "preregistered", "preregistration status");
  expectEqual(
    preregistration.freezeGate,
    "reviewed-phase-boundary-commit",
    "protocol freeze gate",
  );
  expectEqual(heldOutPolicy.caseCount, 12, "preregistered held-out case count");
  expectEqual(heldOutPolicy.envelopeCount, 72, "preregistered envelope count");
  expectEqual(heldOutPolicy.runsPerCohort, 3, "preregistered runs per cohort");
  expectEqual(scoring.topK, 3, "top-three scoring cutoff");
  expectEqual(scoring.tieBreaker, "target-id-ascii-ascending", "tie breaker");
  expectEqual(scoring.tieOrLowerResult, "fail", "superiority tie handling");
  expectEqual(study.toolOrder, "balanced-randomized", "tool ordering");
  expectEqual(study.minimumEligibleParticipants, 8, "minimum participant count");
  expectEqual(study.casesPerParticipant, 12, "cases per participant");
  expectEqual(study.casesPerToolPerParticipant, 6, "cases per tool");
  expectEqual(study.minimumExposuresPerCasePerTool, 4, "minimum case exposure");
  expectEqual(training.traceTopographyMinutes, training.devToolsMinutes, "equal training");
  expectEqual(training.traceTopographyMinutes, 20, "training minutes per tool");
  requireNonEmptyArray(study.participantCriteria, "participant criteria");
  requireNonEmptyArray(study.exclusions, "exclusion rules");
  requireNonEmptyArray(study.failures, "failure rules");
  expectEqual(
    JSON.stringify(asArray(preregistration.resultSchema, "result schema")),
    JSON.stringify(BENCHMARK_RESULT_FIELDS),
    "result schema fields",
  );

  if (!/^[a-f0-9]{64}$/.test(bundle.commitment)) {
    throw new Error("Ground-truth commitment must be one lowercase SHA-256 digest");
  }
  expectEqual(
    groundTruth.commitmentSha256,
    bundle.commitment,
    "published ground-truth commitment",
  );
  expectEqual(groundTruth.rankingAccess, "prohibited", "ranking ground-truth access");

  expectEqual(estimatorPolicy.schemaVersion, 1, "estimator policy schema version");
  expectEqual(estimatorPolicy.family, "median-mad-v1", "estimator family");
  expectEqual(estimatorPolicy.heldOutUse, "prohibited", "held-out estimator use");
  expectEqual(estimatorPolicy.locationEstimator, "median", "location estimator");
  const dispersion = asRecord(
    estimatorPolicy.dispersionEstimator,
    "dispersion estimator",
  );
  expectEqual(dispersion.name, "median-absolute-deviation", "dispersion family");
  expectEqual(dispersion.normalConsistencyScale, 1.4826, "MAD scale");
  const estimatorTie = asRecord(estimatorPolicy.tieHandling, "estimator tie policy");
  expectEqual(estimatorTie.secondaryKey, "target-id-ascii-ascending", "estimator tie key");

  expectEqual(tuningManifest.schemaVersion, 1, "tuning manifest schema version");
  expectEqual(tuningManifest.caseCount, 0, "tuning case count");
  expectEqual(asArray(tuningManifest.cases, "tuning cases").length, 0, "tuning cases");
  expectEqual(tuningManifest.heldOutUse, "prohibited", "tuning held-out use");
  expectEqual(knownRegressions.schemaVersion, 1, "known regressions schema version");
  expectEqual(
    knownRegressions.caseCount,
    asArray(knownRegressions.cases, "known regression cases").length,
    "known regression case count",
  );
  expectEqual(
    knownRegressions.heldOutCaseIdsAllowed,
    false,
    "known-regression held-out exclusion",
  );
  expectEqual(
    knownRegressions.privateLabelsAllowed,
    false,
    "known-regression private-label exclusion",
  );

  expectEqual(heldOutIndex.schemaVersion, 1, "held-out index schema version");
  expectEqual(heldOutIndex.corpusId, heldOutPolicy.corpusId, "held-out corpus ID");
  const cases = asArray(heldOutIndex.cases, "held-out cases");
  expectEqual(heldOutIndex.caseCount, cases.length, "held-out index case count");
  expectEqual(cases.length, 12, "held-out corpus size");
  assertUnlabeledIndex(heldOutIndex);

  const caseIds = new Set<string>();
  const runIds = new Set<string>();
  const paths = new Set<string>();
  let envelopeCount = 0;
  for (const value of cases) {
    const benchmarkCase = asRecord(value, "held-out case");
    const caseId = asString(benchmarkCase.id, "held-out case ID");
    if (caseIds.has(caseId)) throw new Error(`Duplicate held-out case ID: ${caseId}`);
    caseIds.add(caseId);
    for (const cohortName of ["baseline", "candidate"] as const) {
      const cohort = asArray(benchmarkCase[cohortName], `${caseId} ${cohortName}`);
      expectEqual(cohort.length, 3, `${caseId} ${cohortName} cardinality`);
      for (const value of cohort) {
        const run = asRecord(value, `${caseId} run`);
        const runId = asString(run.runId, "run ID");
        const path = asString(run.path, "run path");
        const hash = asString(run.sha256, "run SHA-256");
        if (!Number.isSafeInteger(run.bytes) || (run.bytes as number) <= 0) {
          throw new Error(`Invalid byte length for ${runId}`);
        }
        if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Invalid SHA-256 for ${runId}`);
        if (runIds.has(runId)) throw new Error(`Duplicate run ID: ${runId}`);
        if (paths.has(path)) throw new Error(`Duplicate run path: ${path}`);
        runIds.add(runId);
        paths.add(path);
        envelopeCount++;
      }
    }
  }
  expectEqual(envelopeCount, 72, "held-out envelope count");

  return {
    protocolId: asString(preregistration.protocolId, "protocol ID"),
    corpusId: asString(heldOutIndex.corpusId, "corpus ID"),
    caseCount: cases.length,
    envelopeCount,
    commitment: bundle.commitment,
    estimatorPolicyId: asString(estimatorPolicy.policyId, "estimator policy ID"),
  };
}

export function assertBenchmarkSourceIsolation(
  files: readonly { path: string; content: string }[],
): void {
  const forbidden = [
    [".mk-goal", "custody"].join("/"),
    ["benchmarks", "commitments"].join("/"),
    ["benchmarks", "held-out"].join("/"),
    ["ground-truth", "sha256"].join("."),
  ];
  for (const file of files) {
    const normalized = file.content.replace(/\\/g, "/");
    const match = forbidden.find((fragment) => normalized.includes(fragment));
    if (match) {
      throw new Error(`Benchmark source isolation violation in ${file.path}`);
    }
  }
}

function summarizeOutcomes(values: readonly boolean[]) {
  const correct = values.filter(Boolean).length;
  return { correct, total: values.length, accuracy: correct / values.length };
}

function compareAscii(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function assertUnlabeledIndex(value: unknown): void {
  const prohibitedKeys = new Set([
    "answer",
    "groundTruth",
    "interventionTarget",
    "label",
    "perturbation",
    "targetId",
  ]);
  const visit = (entry: unknown): void => {
    if (Array.isArray(entry)) {
      for (const child of entry) visit(child);
      return;
    }
    if (!isRecord(entry)) return;
    for (const [key, child] of Object.entries(entry)) {
      if (prohibitedKeys.has(key)) {
        throw new Error(`Held-out index contains prohibited label field: ${key}`);
      }
      visit(child);
    }
  };
  visit(value);
}

function requireNonEmptyArray(value: unknown, label: string): void {
  if (asArray(value, label).length === 0) throw new Error(`${label} must not be empty`);
}

function expectEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} must be ${String(expected)}; received ${String(actual)}`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${label} must be a string`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
