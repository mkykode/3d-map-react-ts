import type { PreservedTraceEnvelope } from "./fullEnvelope";
import type { CanonicalTraceSession } from "./traceSession";

export interface ConservationReport {
  importedEvents: number;
  canonicalEvents: number;
  importedResources: number;
  canonicalResources: number;
  importedSourceMaps: number;
  canonicalSourceMaps: number;
}

export function assertTraceSessionConservation(
  envelope: PreservedTraceEnvelope,
  canonical: CanonicalTraceSession,
): ConservationReport {
  const report: ConservationReport = {
    importedEvents: envelope.traceEvents.length,
    canonicalEvents: canonical.evidence.events.length,
    importedResources: envelope.resources.length,
    canonicalResources: canonical.resources.length,
    importedSourceMaps: Object.keys(envelope.sourceMaps).length,
    canonicalSourceMaps: canonical.sourceMaps.length,
  };
  const losses = [
    ["events", report.importedEvents, report.canonicalEvents],
    ["resources", report.importedResources, report.canonicalResources],
    ["source maps", report.importedSourceMaps, report.canonicalSourceMaps],
  ] as const;
  const loss = losses.find(([, imported, retained]) => imported !== retained);
  if (loss) {
    throw new Error(
      `TraceSession conservation failed for ${loss[0]}: imported ${loss[1]}, retained ${loss[2]}`,
    );
  }
  if (canonical.evidence.eventCount !== report.importedEvents) {
    throw new Error(
      `TraceSession event manifest mismatch: imported ${report.importedEvents}, manifest ${canonical.evidence.eventCount}`,
    );
  }
  return report;
}
