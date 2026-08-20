import {
  makeFullEnvelopeFixture,
  type TraceEnvelopeFixture,
} from "./traceEnvelopeFixtures";

export type CohortKind = "baseline" | "candidate";

export interface ExperimentRunFixture {
  id: string;
  cohort: CohortKind;
  envelope: TraceEnvelopeFixture;
}

export interface ExperimentFixture {
  scenario: string;
  baseline: ExperimentRunFixture[];
  candidate: ExperimentRunFixture[];
}

export function makeExperimentFixture(
  baselineCount: number,
  candidateCount: number,
  scenario = "checkout",
): ExperimentFixture {
  const runs = (cohort: CohortKind, count: number) =>
    Array.from({ length: count }, (_, index): ExperimentRunFixture => {
      const id = `${cohort}-${index + 1}`;
      return {
        id,
        cohort,
        envelope: makeFullEnvelopeFixture({ runId: id, scenario }),
      };
    });

  return {
    scenario,
    baseline: runs("baseline", baselineCount),
    candidate: runs("candidate", candidateCount),
  };
}

export const makeThreeByThreeExperiment = () => makeExperimentFixture(3, 3);
export const makeFourByThreeExperiment = () => makeExperimentFixture(4, 3);
export const makeFourByFourExperiment = () => makeExperimentFixture(4, 4);
export const makeFiveByFiveExperiment = () => makeExperimentFixture(5, 5);
export const makeUnderCardinalityExperiment = () => makeExperimentFixture(2, 3);
export const makeOverCardinalityExperiment = () => makeExperimentFixture(5, 6);
