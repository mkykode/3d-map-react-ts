import type { SourceSnippet } from "../engine/findingContract";
import { AvailabilityNotice } from "./AvailabilityNotice";

export function GeneratedSourceSnippet({ source }: { source: SourceSnippet }) {
  return (
    <section className="source-snippet" aria-labelledby="generated-source-title">
      <h3 id="generated-source-title">Generated source</h3>
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

export function SnippetCode({ source }: { source: SourceSnippet }) {
  if (!source.snippet || !source.highlightedLine) return null;
  const offset = source.snippet.indexOf(source.highlightedLine);
  if (offset < 0) return <pre><code>{source.snippet}</code></pre>;
  return (
    <pre>
      <code>
        {source.snippet.slice(0, offset)}
        <span className="sr-only">Exact source line: </span>
        <mark>{source.highlightedLine}</mark>
        {source.snippet.slice(offset + source.highlightedLine.length)}
      </code>
    </pre>
  );
}
