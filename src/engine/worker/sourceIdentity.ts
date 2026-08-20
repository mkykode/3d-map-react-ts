import type { SourcePosition } from "../../source/sourcePosition";
import type { SourceIdentity } from "../findingContract";

export interface SourceFrameInput {
  functionName: string;
  scriptId: string;
  generatedUrl: string;
  generatedLine: number;
  generatedColumn: number;
  authored?: SourcePosition;
  documentUrl?: string;
}

export function normalizeSourceIdentity(input: SourceFrameInput): SourceIdentity {
  const generatedPosition = {
    url: canonicalUri(input.generatedUrl),
    line: input.generatedLine,
    column: input.generatedColumn,
  };
  if (input.authored) {
    const position = {
      ...input.authored,
      url: canonicalUri(input.authored.url),
    };
    return {
      version: 1,
      kind: "authored",
      key: frameKey("authored", input.functionName, position),
      functionName: input.functionName,
      position,
      generatedPosition,
    };
  }
  if (!input.generatedUrl) {
    const position = {
      url: `${canonicalUri(input.documentUrl ?? "inline://unknown")}#script-${input.scriptId}`,
      line: input.generatedLine,
      column: input.generatedColumn,
    };
    return {
      version: 1,
      kind: "inline",
      key: frameKey("inline", input.functionName, position),
      functionName: input.functionName,
      position,
      generatedPosition: position,
    };
  }

  const position = {
    ...generatedPosition,
    url: normalizeAssetHash(generatedPosition.url),
  };
  return {
    version: 1,
    kind: "generated",
    key: frameKey("generated", input.functionName, position),
    functionName: input.functionName,
    position,
    generatedPosition,
  };
}

function frameKey(kind: string, functionName: string, position: SourcePosition): string {
  return [kind, position.url, functionName || "(anonymous)", position.line, position.column].join(
    "\u0000",
  );
}

function normalizeAssetHash(value: string): string {
  return value.replace(/([.-])[a-f0-9]{8,}(?=\.[a-z0-9]+(?:$|[?#]))/gi, "$1[hash]");
}

function canonicalUri(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.href;
  } catch {
    return value.replace(/\\/g, "/");
  }
}
