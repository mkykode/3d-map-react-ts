import { describe, expect, test } from "vitest";
import type { EvidenceUnavailableReason } from "../domain/evidence";
import {
  describeAvailability,
  unavailableEvidence,
} from "./availability";

describe("evidence availability", () => {
  test("presents every fail-closed state with a specific reason", () => {
    const expected: Record<EvidenceUnavailableReason, string> = {
      "unsupported-platform": "Unsupported platform",
      "unsupported-metric": "Unsupported metric",
      "missing-trace-data": "Trace data missing",
      "missing-source": "Source unavailable",
      "malformed-source-map": "Source map malformed",
      "stale-source-map": "Source map stale",
      "ambiguous-source": "Source match ambiguous",
      "blocked-uri": "Source access blocked",
      "security-limit": "Security limit reached",
      "incompatible-runs": "Runs incompatible",
      "omitted-evidence": "Evidence omitted",
      canceled: "Analysis canceled",
    };

    for (const [reason, title] of Object.entries(expected)) {
      const availability = unavailableEvidence(
        reason as EvidenceUnavailableReason,
        `Specific detail for ${reason}`,
      );
      expect(describeAvailability(availability)).toMatchObject({
        available: false,
        title,
        detail: `Specific detail for ${reason}`,
      });
    }
  });

  test("rejects an unavailable state without actionable detail", () => {
    expect(() => unavailableEvidence("canceled", "  ")).toThrow(
      "Unavailable evidence requires a specific detail",
    );
  });
});
