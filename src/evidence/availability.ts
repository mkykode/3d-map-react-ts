import type {
  EvidenceAvailability,
  EvidenceLevel,
  EvidenceUnavailableReason,
} from "../domain/evidence";

export interface AvailabilityDescription {
  available: boolean;
  title: string;
  detail: string;
  severity: "status" | "warning" | "error";
}

const UNAVAILABLE_COPY: Record<
  EvidenceUnavailableReason,
  Pick<AvailabilityDescription, "title" | "severity">
> = {
  "unsupported-platform": { title: "Unsupported platform", severity: "warning" },
  "unsupported-metric": { title: "Unsupported metric", severity: "warning" },
  "missing-trace-data": { title: "Trace data missing", severity: "warning" },
  "missing-source": { title: "Source unavailable", severity: "warning" },
  "malformed-source-map": { title: "Source map malformed", severity: "warning" },
  "stale-source-map": { title: "Source map stale", severity: "warning" },
  "ambiguous-source": { title: "Source match ambiguous", severity: "warning" },
  "blocked-uri": { title: "Source access blocked", severity: "error" },
  "security-limit": { title: "Security limit reached", severity: "error" },
  "incompatible-runs": { title: "Runs incompatible", severity: "error" },
  "omitted-evidence": { title: "Evidence omitted", severity: "warning" },
  canceled: { title: "Analysis canceled", severity: "status" },
};

export const EVIDENCE_LEVEL_COPY: Record<
  EvidenceLevel,
  { label: string; description: string }
> = {
  "trace-observation": {
    label: "Trace observation",
    description: "Directly observed in the imported trace.",
  },
  "lab-metric": {
    label: "Lab metric",
    description: "Measured in a controlled local trace, not field data.",
  },
  "field-metric": {
    label: "Field metric",
    description: "Measured from real-user field data.",
  },
  "derived-association": {
    label: "Derived association",
    description: "Computed association that does not prove causality.",
  },
  "intervention-validated": {
    label: "Intervention validated",
    description: "The predicted change was observed after an intervention.",
  },
};

export function unavailableEvidence(
  reason: EvidenceUnavailableReason,
  detail: string,
): EvidenceAvailability {
  const normalizedDetail = detail.trim();
  if (!normalizedDetail) {
    throw new Error("Unavailable evidence requires a specific detail");
  }
  return { state: "unavailable", reason, detail: normalizedDetail };
}

export function describeAvailability(
  availability: EvidenceAvailability,
): AvailabilityDescription {
  if (availability.state === "available") {
    return {
      available: true,
      title: "Evidence available",
      detail: "The requested evidence is available.",
      severity: "status",
    };
  }
  const copy = UNAVAILABLE_COPY[availability.reason];
  return {
    available: false,
    title: copy.title,
    detail: availability.detail,
    severity: copy.severity,
  };
}

export function firstUnavailable(
  values: readonly EvidenceAvailability[],
): EvidenceAvailability {
  return (
    values.find((value) => value.state === "unavailable") ?? {
      state: "available",
    }
  );
}
