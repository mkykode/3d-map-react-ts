import type { FindingEvidenceQualityClass } from "../../domain/analysis";
import type { SourceIdentity } from "../findingContract";

export type SemanticEntityKind =
  | "source-frame"
  | "browser-domain"
  | "request"
  | "frame-outcome"
  | "metric";

export interface SemanticIdentity {
  version: 1;
  kind: SemanticEntityKind;
  key: string;
  title: string;
  evidenceQuality: FindingEvidenceQualityClass;
  complete: boolean;
}

export type SemanticIdentityInput =
  | { kind: "source-frame"; source: SourceIdentity }
  | { kind: "browser-domain"; domain: string }
  | { kind: "request"; method: string | null; url: string }
  | { kind: "frame-outcome"; outcome: "presented" | "dropped" }
  | { kind: "metric"; name: string };

export function semanticIdentity(input: SemanticIdentityInput): SemanticIdentity {
  switch (input.kind) {
    case "source-frame": {
      const sourceKind = input.source.kind === "authored" ? "authored" : "generated";
      return identity(
        input.kind,
        `source-frame:${sourceKind}:${input.source.key}`,
        input.source.functionName || "(anonymous)",
        sourceKind === "authored" ? "authored-source" : "generated-source",
      );
    }
    case "browser-domain": {
      const domain = requiredToken(input.domain, "browser domain");
      return identity(input.kind, `browser-domain:${domain}`, input.domain.trim());
    }
    case "request": {
      const method = requiredToken(input.method ?? "", "request method").toUpperCase();
      const url = canonicalRequestUrl(input.url);
      return identity(input.kind, `request:${method}:${url}`, `${method} ${url}`);
    }
    case "frame-outcome":
      return identity(
        input.kind,
        `frame-outcome:${input.outcome}`,
        input.outcome === "dropped" ? "Dropped frame" : "Presented frame",
      );
    case "metric": {
      const name = requiredToken(input.name, "metric name");
      return identity(input.kind, `metric:${name}`, input.name.trim());
    }
  }
}

function identity(
  kind: SemanticEntityKind,
  key: string,
  title: string,
  evidenceQuality: FindingEvidenceQualityClass = "stable-non-source-identity",
): SemanticIdentity {
  return { version: 1, kind, key, title, evidenceQuality, complete: true };
}

function requiredToken(value: string, label: string): string {
  const token = value.trim().toLowerCase();
  if (!token) throw new Error(`Semantic ${label} is required`);
  return token;
}

function canonicalRequestUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    throw new Error("Semantic request URL must be absolute");
  }
}
