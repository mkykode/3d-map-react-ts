import type { FindingId } from "../domain/analysis";
import type { EvidenceIdentity } from "../domain/evidence";
import { ENGINE_LIMITS } from "../engine/limits";

export const EVIDENCE_SLICE_SECTIONS = [
  "contributors",
  "timeline",
  "table",
  "screenshots",
  "provenance",
] as const;

export type EvidenceSliceSection = (typeof EVIDENCE_SLICE_SECTIONS)[number];

export interface EvidenceSliceQuery {
  version: 1;
  findingId: FindingId;
  evidenceId: EvidenceIdentity;
  contributorId: string;
  include: readonly EvidenceSliceSection[];
  byteBudget: number;
}

export function evidenceSliceQuery(
  input: Omit<EvidenceSliceQuery, "version">,
): EvidenceSliceQuery {
  if (!input.contributorId.startsWith("contributor:v1:")) {
    throw new Error("Invalid regression contributor identity");
  }
  if (input.include.length === 0) {
    throw new Error("Evidence slice query must request at least one section");
  }
  if (new Set(input.include).size !== input.include.length) {
    throw new Error("Evidence slice query contains duplicate sections");
  }
  if (!input.include.every((section) => EVIDENCE_SLICE_SECTIONS.includes(section))) {
    throw new Error("Evidence slice query contains an unsupported section");
  }
  if (!Number.isSafeInteger(input.byteBudget) || input.byteBudget <= 0) {
    throw new Error("Evidence slice budget must be a positive safe integer");
  }
  if (input.byteBudget > ENGINE_LIMITS.evidenceSliceBytes) {
    throw new Error(
      `Evidence slice budget exceeds the engine limit: ${input.byteBudget} > ${ENGINE_LIMITS.evidenceSliceBytes}`,
    );
  }
  return { version: 1, ...input, include: [...input.include] };
}
