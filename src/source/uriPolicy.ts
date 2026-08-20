import type { EvidenceUnavailableReason } from "../domain/evidence";
import { ENGINE_LIMITS } from "../engine/limits";

export type SourceUriDecision =
  | { allowed: true; scheme: string }
  | { allowed: false; reason: EvidenceUnavailableReason; detail: string };

export function assessSourceUri(uri: string, embedded: boolean): SourceUriDecision {
  if (containsTraversal(uri)) {
    return { allowed: false, reason: "blocked-uri", detail: "Source URI traversal is blocked" };
  }
  const scheme = uriScheme(uri);
  if (embedded) return { allowed: true, scheme };
  switch (scheme) {
    case "http":
    case "https":
      return {
        allowed: false,
        reason: "missing-source",
        detail: "HTTP source is not embedded; ambient network access is disabled",
      };
    case "blob":
      return {
        allowed: false,
        reason: "blocked-uri",
        detail: "Blob source is not embedded and cannot be dereferenced",
      };
    case "file":
      return {
        allowed: false,
        reason: "blocked-uri",
        detail: "File source requires an explicitly granted workspace",
      };
    case "data":
      return { allowed: true, scheme };
    case "inline":
      return {
        allowed: false,
        reason: "missing-source",
        detail: "Inline script content is not embedded for this script ID",
      };
    default:
      return {
        allowed: false,
        reason: "missing-source",
        detail: "Virtual source content is not embedded in the trace or source map",
      };
  }
}

export function decodeDataUri(uri: string): string | null {
  if (!uri.startsWith("data:")) return null;
  const comma = uri.indexOf(",");
  if (comma < 0) return null;
  const metadata = uri.slice(5, comma);
  const encoded = uri.slice(comma + 1);
  try {
    const content = metadata.split(";").includes("base64")
      ? atob(encoded)
      : decodeURIComponent(encoded);
    if (new TextEncoder().encode(content).byteLength > ENGINE_LIMITS.resourceBytes) {
      return null;
    }
    return content;
  } catch {
    return null;
  }
}

export function containsTraversal(uri: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    return true;
  }
  return decoded.replace(/\\/g, "/").split(/[/?#]/).includes("..");
}

function uriScheme(uri: string): string {
  if (!uri) return "inline";
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(uri);
  return match?.[1].toLowerCase() ?? "virtual";
}
