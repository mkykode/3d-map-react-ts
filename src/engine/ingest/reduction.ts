import type { TraceReduction } from "./types.ts";

/** Metadata belongs to the input file, so a reserved-looking key is not trusted. */
export function readTraceReduction(value: unknown): TraceReduction | null {
  if (!value || typeof value !== "object") return null;
  const report = value as Record<string, unknown>;
  if (report.version !== 1 || report.mode !== "visualization") return null;
  if (!["sourceEventCount", "retainedEventCount", "droppedBookkeeping", "droppedSourceEvents", "droppedMalformed", "outsideWindow"].every((key) => Number.isSafeInteger(report[key]) && (report[key] as number) >= 0)) return null;
  if (!Array.isArray(report.omittedEnvelopeFields) || report.omittedEnvelopeFields.length > 128 || !report.omittedEnvelopeFields.every((field) => typeof field === "string")) return null;
  if (typeof report.importSha256 !== "string" || typeof report.payloadSha256 !== "string") return null;
  if (report.window !== null && (!Array.isArray(report.window) || report.window.length !== 2 || !report.window.every(Number.isFinite) || report.window[1] <= report.window[0])) return null;
  return value as TraceReduction;
}
