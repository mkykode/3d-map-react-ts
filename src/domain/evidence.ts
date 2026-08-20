import type { OpaqueId, SessionId } from "./analysis";

export type EvidenceIdentity = OpaqueId<"EvidenceIdentity.v1">;

export function evidenceIdentity(value: string): EvidenceIdentity {
  if (!/^evidence:v1:[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error("Invalid evidence identifier");
  }
  return value as EvidenceIdentity;
}

export type EvidenceLevel =
  | "trace-observation"
  | "lab-metric"
  | "field-metric"
  | "derived-association"
  | "intervention-validated";

export type EvidenceUnavailableReason =
  | "unsupported-platform"
  | "unsupported-metric"
  | "missing-trace-data"
  | "missing-source"
  | "malformed-source-map"
  | "stale-source-map"
  | "ambiguous-source"
  | "blocked-uri"
  | "security-limit"
  | "incompatible-runs"
  | "omitted-evidence"
  | "canceled";

export type EvidenceAvailability =
  | { state: "available" }
  | {
      state: "unavailable";
      reason: EvidenceUnavailableReason;
      detail: string;
    };

export interface EvidenceReference {
  version: 1;
  id: EvidenceIdentity;
  sessionId: SessionId;
  level: EvidenceLevel;
  availability: EvidenceAvailability;
  eventKeys: readonly string[];
  importSha256: string;
  payloadSha256: string;
}

export interface EvidenceSlice {
  version: 1;
  id: EvidenceIdentity;
  level: EvidenceLevel;
  availability: EvidenceAvailability;
  unit: "ms" | "bytes" | "count" | "score" | "source";
  byteLength: number;
  payload: unknown;
}
