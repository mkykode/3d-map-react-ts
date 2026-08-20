import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AvailabilityNotice } from "./AvailabilityNotice";
import { EvidenceLevelBadge } from "./EvidenceLevelBadge";

describe("availability primitives", () => {
  test("keeps an empty live region mounted before unavailable content arrives", () => {
    const available = renderToStaticMarkup(
      createElement(AvailabilityNotice, {
        availability: { state: "available" },
      }),
    );
    const unavailable = renderToStaticMarkup(
      createElement(AvailabilityNotice, {
        availability: {
          state: "unavailable",
          reason: "missing-source",
          detail: "No embedded source is available.",
        },
      }),
    );

    expect(available).toContain('role="status"');
    expect(available).toContain('aria-live="polite"');
    expect(textContent(available)).toBe("");
    expect(unavailable).toContain('role="status"');
    expect(textContent(unavailable)).toContain("Source unavailable");
    expect(textContent(unavailable)).toContain("No embedded source is available.");
  });

  test("renders the evidence caveat as visible text rather than title-only content", () => {
    const markup = renderToStaticMarkup(
      createElement(EvidenceLevelBadge, { level: "derived-association" }),
    );

    expect(textContent(markup)).toContain("Evidence: Derived association");
    expect(textContent(markup)).toContain(
      "Computed association that does not prove causality.",
    );
    expect(markup).not.toContain("title=");
  });
});

function textContent(markup: string): string {
  return markup.replace(/<[^>]*>/g, "");
}
