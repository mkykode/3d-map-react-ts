import { ENGINE_LIMITS } from "../engine/limits";
import type { SourcePosition } from "./sourcePosition";

export type SourceMapFailureReason =
  | "missing"
  | "malformed"
  | "stale"
  | "ambiguous"
  | "blocked"
  | "security-limit";

export type SourceMapResolution =
  | (SourcePosition & {
      ok: true;
      content: string | null;
    })
  | { ok: false; reason: SourceMapFailureReason; detail: string };

interface MappingEntry {
  generatedLine: number;
  generatedColumn: number;
  sourceUrl: string;
  originalLine: number;
  originalColumn: number;
  sourceContent: string | null;
}

export function resolveSourceMapPosition(
  rawMap: string,
  mapUrl: string,
  generatedUrl: string,
  generatedLine: number,
  generatedColumn: number,
): SourceMapResolution {
  if (new TextEncoder().encode(rawMap).byteLength > ENGINE_LIMITS.sourceMapBytes) {
    return failure("security-limit", "Source map exceeds the byte limit");
  }
  let value: unknown;
  try {
    value = JSON.parse(rawMap) as unknown;
  } catch {
    return failure("malformed", "Source map is not valid JSON");
  }
  if (!isRecord(value) || value.version !== 3) {
    return failure("malformed", "Source map must be a version 3 object");
  }
  if (typeof value.file === "string" && !filesMatch(value.file, generatedUrl)) {
    return failure("stale", "Source map file does not match the generated resource");
  }

  let entries: MappingEntry[];
  try {
    entries = parseMap(value, mapUrl, 0, 0, 0);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const reason = /traversal|blocked URI/i.test(detail)
      ? "blocked"
      : /depth|byte limit/i.test(detail)
        ? "security-limit"
        : "malformed";
    return failure(reason, detail);
  }
  const candidates = entries.filter(
    (entry) =>
      entry.generatedLine === generatedLine &&
      entry.generatedColumn <= generatedColumn,
  );
  if (candidates.length === 0) {
    return failure("missing", "No source-map segment covers the generated position");
  }
  const closestColumn = Math.max(...candidates.map((entry) => entry.generatedColumn));
  const closest = candidates.filter((entry) => entry.generatedColumn === closestColumn);
  const uniqueTargets = new Set(
    closest.map(
      (entry) =>
        `${entry.sourceUrl}\u0000${entry.originalLine}\u0000${entry.originalColumn}`,
    ),
  );
  if (uniqueTargets.size !== 1) {
    return failure("ambiguous", "Multiple authored positions match the generated position");
  }
  const match = closest[0];
  return {
    ok: true,
    url: match.sourceUrl,
    line: match.originalLine,
    column: match.originalColumn + (generatedColumn - match.generatedColumn),
    content: match.sourceContent,
  };
}

function parseMap(
  map: Record<string, unknown>,
  mapUrl: string,
  lineOffset: number,
  columnOffset: number,
  depth: number,
): MappingEntry[] {
  if (depth >= ENGINE_LIMITS.sourceMapDepth) {
    throw new Error("Source map nesting depth limit exceeded");
  }
  if (Array.isArray(map.sections)) {
    return map.sections.flatMap((section) => {
      if (!isRecord(section) || !isRecord(section.offset) || !isRecord(section.map)) {
        throw new Error("Source map section is malformed");
      }
      const line = integer(section.offset.line, "section line");
      const column = integer(section.offset.column, "section column");
      return parseMap(
        section.map,
        mapUrl,
        lineOffset + line,
        line === 0 ? columnOffset + column : column,
        depth + 1,
      );
    });
  }

  if (
    typeof map.mappings !== "string" ||
    !Array.isArray(map.sources) ||
    map.sources.some((source) => typeof source !== "string")
  ) {
    throw new Error("Regular source map fields are malformed");
  }
  const sources = map.sources as string[];
  const sourceContents = Array.isArray(map.sourcesContent)
    ? map.sourcesContent
    : [];
  const sourceRoot = typeof map.sourceRoot === "string" ? map.sourceRoot : undefined;
  const entries: MappingEntry[] = [];
  let sourceIndex = 0;
  let originalLine = 0;
  let originalColumn = 0;

  for (const [relativeLine, encodedLine] of map.mappings.split(";").entries()) {
    let generatedColumn = 0;
    for (const encodedSegment of encodedLine.split(",")) {
      if (!encodedSegment) continue;
      const fields = decodeVlq(encodedSegment);
      if (fields.length === 1) continue;
      if (fields.length < 4) throw new Error("Source map segment is incomplete");
      generatedColumn += fields[0];
      sourceIndex += fields[1];
      originalLine += fields[2];
      originalColumn += fields[3];
      const source = sources[sourceIndex];
      if (source === undefined) throw new Error("Source map source index is out of range");
      const content = sourceContents[sourceIndex];
      if (content !== undefined && content !== null && typeof content !== "string") {
        throw new Error("Source map source content is malformed");
      }
      entries.push({
        generatedLine: lineOffset + relativeLine,
        generatedColumn:
          generatedColumn + (relativeLine === 0 ? columnOffset : 0),
        sourceUrl: resolveSourceUrl(source, sourceRoot, mapUrl),
        originalLine,
        originalColumn,
        sourceContent: typeof content === "string" ? content : null,
      });
    }
  }
  return entries;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeVlq(value: string): number[] {
  const output: number[] = [];
  let index = 0;
  while (index < value.length) {
    let result = 0;
    let shift = 0;
    let continuation: boolean;
    do {
      const digit = BASE64.indexOf(value[index++]);
      if (digit < 0) throw new Error("Source map contains invalid VLQ data");
      continuation = (digit & 32) !== 0;
      result += (digit & 31) << shift;
      shift += 5;
    } while (continuation && index < value.length);
    if (continuation) throw new Error("Source map contains truncated VLQ data");
    const negative = (result & 1) === 1;
    const magnitude = result >> 1;
    output.push(negative ? -magnitude : magnitude);
  }
  return output;
}

function resolveSourceUrl(source: string, sourceRoot: string | undefined, mapUrl: string): string {
  if (source.replace(/\\/g, "/").split("/").includes("..")) {
    throw new Error("Source map path traversal is blocked");
  }
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(source)) return new URL(source).href;
    const base = sourceRoot ? new URL(sourceRoot, mapUrl).href : mapUrl;
    return new URL(source, base).href;
  } catch {
    return sourceRoot ? `${sourceRoot.replace(/\/$/, "")}/${source}` : source;
  }
}

function filesMatch(file: string, generatedUrl: string): boolean {
  return basename(file) === basename(generatedUrl);
}

function basename(value: string): string {
  try {
    return new URL(value, "https://source-map.invalid/").pathname.split("/").pop() ?? "";
  } catch {
    return value.split(/[\\/]/).pop() ?? "";
  }
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function failure(reason: SourceMapFailureReason, detail: string): SourceMapResolution {
  return { ok: false, reason, detail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
