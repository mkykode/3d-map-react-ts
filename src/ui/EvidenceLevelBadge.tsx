import type { EvidenceLevel } from "../domain/evidence";
import { EVIDENCE_LEVEL_COPY } from "../evidence/availability";

export function EvidenceLevelBadge({ level }: { level: EvidenceLevel }) {
  const copy = EVIDENCE_LEVEL_COPY[level];
  return (
    <span className={`evidence-level evidence-level-${level}`}>
      <span>Evidence: {copy.label}</span>{" "}
      <span className="evidence-level-description">{copy.description}</span>
    </span>
  );
}
