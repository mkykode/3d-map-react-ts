import type {
  FindingEvidenceQualityClass,
  Finding,
  FindingMeasurement,
  FindingPromotionReason,
  FindingRunSample,
} from "../../domain/analysis";
import type { EvidenceAvailability } from "../../domain/evidence";
import { unavailableEvidence } from "../../evidence/availability";

export const MEDIAN_MAD_POLICY = {
  id: "median-mad-v1",
  minimumRunsPerCohort: 3,
  normalConsistencyScale: 1.4826,
  promotionDispersionMultiplier: 2,
  unitFloors: { ms: 0.1, bytes: 1024, count: 1, score: 0.001 },
  evidenceQualityWeights: {
    "authored-source": 1,
    "generated-source": 0.9,
    "stable-non-source-identity": 0.85,
    unmatched: 0.7,
  },
} as const;

export type CohortStatistics = Pick<
  Finding,
  "measurement" | "evidenceQuality" | "availability" | "promotion" | "missingness"
> & {
  score: number;
};

export function calculateCohortStatistics(input: {
  unit: FindingMeasurement["unit"];
  baselineRuns: readonly FindingRunSample[];
  candidateRuns: readonly FindingRunSample[];
  evidenceQuality: FindingEvidenceQualityClass;
  completeIdentity: boolean;
}): CohortStatistics {
  const baselineValues = presentValues(input.baselineRuns);
  const candidateValues = presentValues(input.candidateRuns);
  const baseline = median(baselineValues);
  const candidate = median(candidateValues);
  const baselineDispersion = scaledMad(baselineValues);
  const candidateDispersion = scaledMad(candidateValues);
  const dispersion = baselineDispersion === null || candidateDispersion === null
    ? null
    : Math.max(baselineDispersion, candidateDispersion);
  const absoluteDelta = baseline === null || candidate === null
    ? null
    : candidate - baseline;
  const floor = MEDIAN_MAD_POLICY.unitFloors[input.unit];
  const relativeDelta = absoluteDelta === null || baseline === null
    ? null
    : absoluteDelta / Math.max(Math.abs(baseline), floor);
  const baselineCompleteness = completeness(input.baselineRuns);
  const candidateCompleteness = completeness(input.candidateRuns);
  const baselineMissing = input.baselineRuns.length - baselineValues.length;
  const candidateMissing = input.candidateRuns.length - candidateValues.length;
  const evidenceWeight = MEDIAN_MAD_POLICY.evidenceQualityWeights[input.evidenceQuality];
  const complete = Math.min(baselineCompleteness, candidateCompleteness);
  const score = absoluteDelta === null
    ? 0
    : Math.max(0, absoluteDelta) / Math.max(dispersion ?? 0, floor) *
      complete * evidenceWeight;
  const enoughSamples =
    baselineValues.length >= MEDIAN_MAD_POLICY.minimumRunsPerCohort &&
    candidateValues.length >= MEDIAN_MAD_POLICY.minimumRunsPerCohort;
  const availability: EvidenceAvailability = enoughSamples
    ? { state: "available" }
    : unavailableEvidence(
        "omitted-evidence",
        "Finding promotion requires at least three measured runs in each cohort; missing runs remain unknown",
      );
  const promotionReasons: FindingPromotionReason[] = [];
  if (availability.state !== "available") promotionReasons.push("insufficient-samples");
  if (absoluteDelta === null || absoluteDelta <= 0) {
    promotionReasons.push("non-positive-effect");
  } else if (
    dispersion === null ||
    absoluteDelta <= MEDIAN_MAD_POLICY.promotionDispersionMultiplier * dispersion
  ) {
    promotionReasons.push("effect-within-dispersion");
  }
  if (!input.completeIdentity) promotionReasons.push("incomplete-identity");

  return {
    measurement: {
      unit: input.unit,
      baseline,
      candidate,
      absoluteDelta,
      relativeDelta,
      dispersion,
      baselineSamples: baselineValues.length,
      candidateSamples: candidateValues.length,
      baselineCompleteness,
      candidateCompleteness,
    },
    evidenceQuality: { class: input.evidenceQuality, weight: evidenceWeight },
    availability,
    score,
    promotion: {
      eligible: promotionReasons.length === 0,
      reasons: promotionReasons,
    },
    missingness: {
      state: baselineValues.length === 0 || candidateValues.length === 0
        ? "unknown"
        : baselineMissing > 0 || candidateMissing > 0
          ? "incomplete"
          : "complete",
      baselineMissing,
      candidateMissing,
    },
  };
}

function presentValues(samples: readonly FindingRunSample[]): number[] {
  return samples.flatMap((sample) => sample.value === null ? [] : [sample.value]);
}

function completeness(samples: readonly FindingRunSample[]): number {
  if (samples.length === 0) return 0;
  return presentValues(samples).length / samples.length;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function scaledMad(values: readonly number[]): number | null {
  const location = median(values);
  if (location === null) return null;
  const deviation = median(values.map((value) => Math.abs(value - location)));
  return deviation === null
    ? null
    : deviation * MEDIAN_MAD_POLICY.normalConsistencyScale;
}
