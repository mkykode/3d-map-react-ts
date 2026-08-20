import type { AnalysisScope, Finding, OpaqueId } from "./analysis";
import type { EvidenceSlice } from "./evidence";

export type EvidenceCaseId = OpaqueId<"EvidenceCaseId.v1">;

export interface EvidenceCase {
  schemaVersion: 1;
  id: EvidenceCaseId;
  title: string;
  createdAt: string;
  scope: AnalysisScope;
  finding: Finding;
  hypothesis: string;
  interventionStatus: "untried" | "planned" | "tested" | "validated";
  evidence: readonly EvidenceSlice[];
  sourcePolicy: "content" | "source-maps" | "hashes-only" | "references-only";
  integrity: {
    algorithm: "SHA-256";
    sliceHashes: Readonly<Record<string, string>>;
    bundleHash: string;
  };
}
