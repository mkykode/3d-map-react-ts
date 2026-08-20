import type { EvidenceAvailability } from "../../domain/evidence";
import { unavailableEvidence } from "../../evidence/availability";
import type {
  SourceSnippet,
  TracerSourceResult,
} from "../findingContract";
import { ENGINE_LIMITS } from "../limits";
import {
  resolveSourceMapPosition,
  type SourceMapFailureReason,
} from "../../source/sourceMap";
import { assessSourceUri, decodeDataUri } from "../../source/uriPolicy";
import {
  normalizeSourceIdentity,
  type SourceFrameInput,
} from "./sourceIdentity";

export interface EmbeddedResource {
  url: string;
  mimeType: string;
  content: string;
  sourceMapUrl?: string;
  scriptId?: string;
  documentUrl?: string;
}

export function resolveTracerSource(
  frame: SourceFrameInput,
  resources: readonly EmbeddedResource[],
  sourceMaps: Readonly<Record<string, string>>,
): TracerSourceResult {
  const matchingResources = resources.filter((candidate) =>
    frame.generatedUrl
      ? candidate.url === frame.generatedUrl
      : candidate.scriptId === frame.scriptId &&
        (!candidate.documentUrl || candidate.documentUrl === frame.documentUrl),
  );
  const resource = matchingResources.length === 1 ? matchingResources[0] : undefined;
  const dataContent = resource ? null : decodeDataUri(frame.generatedUrl);
  const generated = matchingResources.length > 1
    ? unavailableSnippet(
        frame,
        "ambiguous-source",
        "Multiple embedded resources match the source frame",
      )
    : resource
      ? snippetFromContent(
        resource.content,
        frame.generatedUrl,
        frame.generatedLine,
        frame.generatedColumn,
        "embedded-resource",
      )
      : dataContent !== null
        ? snippetFromContent(
            dataContent,
            frame.generatedUrl,
            frame.generatedLine,
            frame.generatedColumn,
            "embedded-resource",
          )
        : unavailableFromUriPolicy(frame);

  const mapping = resolveMapping(frame, resource, sourceMaps);
  const authored = mapping.resolution?.ok
    ? mapping.resolution.content === null
      ? unavailableAt(
          mapping.resolution.url,
          mapping.resolution.line,
          mapping.resolution.column,
          "missing-source",
          "Source map has no embedded authored content",
        )
      : snippetFromContent(
          mapping.resolution.content,
          mapping.resolution.url,
          mapping.resolution.line,
          mapping.resolution.column,
          "source-map",
        )
    : null;
  const identity = normalizeSourceIdentity({
    ...frame,
    authored: mapping.resolution?.ok
      ? {
          url: mapping.resolution.url,
          line: mapping.resolution.line,
          column: mapping.resolution.column,
        }
      : undefined,
  });
  return {
    identity,
    generated,
    authored,
    mappingState: mapping.state,
    mappingFailure: mapping.failure,
  };
}

function resolveMapping(
  frame: SourceFrameInput,
  resource: EmbeddedResource | undefined,
  sourceMaps: Readonly<Record<string, string>>,
): {
  state: TracerSourceResult["mappingState"];
  resolution: ReturnType<typeof resolveSourceMapPosition> | null;
  failure: EvidenceAvailability | null;
} {
  const mapUrl = resource?.sourceMapUrl;
  if (!mapUrl) return { state: "not-requested", resolution: null, failure: null };
  const rawMap = sourceMaps[mapUrl];
  if (rawMap === undefined) {
    return {
      state: "missing",
      resolution: null,
      failure: unavailableEvidence("missing-source", "Referenced source map is not embedded"),
    };
  }
  const resolution = resolveSourceMapPosition(
    rawMap,
    mapUrl,
    frame.generatedUrl,
    frame.generatedLine,
    frame.generatedColumn,
  );
  if (resolution.ok) {
    return { state: "mapped", resolution, failure: null };
  }
  return {
    state: resolution.reason,
    resolution,
    failure: unavailableEvidence(sourceMapEvidenceReason(resolution.reason), resolution.detail),
  };
}

function snippetFromContent(
  content: string,
  url: string,
  line: number,
  column: number,
  provenance: SourceSnippet["provenance"],
): SourceSnippet {
  if (new TextEncoder().encode(content).byteLength > ENGINE_LIMITS.resourceBytes) {
    return unavailableAt(
      url,
      line,
      column,
      "security-limit",
      "Embedded resource exceeds the per-resource byte limit",
    );
  }
  const lines = content.split(/\r?\n/);
  const highlightedLine = lines[line];
  if (highlightedLine === undefined || column < 0 || column > highlightedLine.length) {
    return unavailableAt(
      url,
      line,
      column,
      "missing-source",
      "Generated source position is outside the embedded resource",
    );
  }
  const start = Math.max(0, line - 2);
  const end = Math.min(lines.length, line + 3);
  return {
    availability: { state: "available" },
    provenance,
    url,
    line,
    column,
    snippet: lines.slice(start, end).join("\n"),
    highlightedLine,
  };
}

function unavailableSnippet(
  frame: SourceFrameInput,
  reason: "missing-source" | "blocked-uri" | "ambiguous-source" | "security-limit",
  detail: string,
): SourceSnippet {
  return unavailableAt(
    frame.generatedUrl,
    frame.generatedLine,
    frame.generatedColumn,
    reason,
    detail,
  );
}

function unavailableAt(
  url: string,
  line: number,
  column: number,
  reason: "missing-source" | "blocked-uri" | "ambiguous-source" | "security-limit",
  detail: string,
): SourceSnippet {
  return {
    availability: unavailableEvidence(reason, detail),
    provenance: "unavailable",
    url,
    line,
    column,
    snippet: null,
    highlightedLine: null,
  };
}

function unavailableFromUriPolicy(frame: SourceFrameInput): SourceSnippet {
  const decision = assessSourceUri(frame.generatedUrl, false);
  if (decision.allowed) {
    return unavailableSnippet(frame, "missing-source", "Embedded source content is unavailable");
  }
  const reason =
    decision.reason === "blocked-uri" ? "blocked-uri" : "missing-source";
  return unavailableSnippet(frame, reason, decision.detail);
}

function sourceMapEvidenceReason(
  reason: SourceMapFailureReason,
): "missing-source" | "malformed-source-map" | "stale-source-map" | "ambiguous-source" | "blocked-uri" | "security-limit" {
  switch (reason) {
    case "missing":
      return "missing-source";
    case "malformed":
      return "malformed-source-map";
    case "stale":
      return "stale-source-map";
    case "ambiguous":
      return "ambiguous-source";
    case "blocked":
      return "blocked-uri";
    case "security-limit":
      return "security-limit";
  }
}
