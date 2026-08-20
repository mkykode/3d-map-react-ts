import type { EvidenceAvailability } from "../domain/evidence";
import type { SourceSnippet } from "../engine/findingContract";
import { AvailabilityNotice } from "./AvailabilityNotice";
import { SnippetCode } from "./GeneratedSourceSnippet";

export function AuthoredSourceSnippet({
  source,
  fallbackUsed,
  mappingFailure,
}: {
  source: SourceSnippet;
  fallbackUsed: boolean;
  mappingFailure: EvidenceAvailability | null;
}) {
  return (
    <section className="source-snippet" aria-labelledby="authored-source-title">
      <h3 id="authored-source-title">Authored source</h3>
      {fallbackUsed ? <p className="source-fallback">Generated fallback</p> : null}
      {mappingFailure?.state === "unavailable" ? (
        <AvailabilityNotice availability={mappingFailure} />
      ) : null}
      <p className="source-position">
        {source.url || "inline script"} | line {source.line + 1}, column {source.column + 1}
      </p>
      {source.availability.state === "unavailable" ? (
        <AvailabilityNotice availability={source.availability} />
      ) : (
        <SnippetCode source={source} />
      )}
    </section>
  );
}
