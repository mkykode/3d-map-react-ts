import { describe, expect, test, vi } from "vitest";
import { makeSourceMapFixture } from "../../test/traceEnvelopeFixtures";
import { resolveTracerSource } from "./tracerSource";

describe("trace source resolver", () => {
  test("resolves an exact generated snippet from an embedded resource", () => {
    const fixture = makeSourceMapFixture();
    const result = resolveTracerSource(
      {
        functionName: "work",
        scriptId: "1",
        generatedUrl: fixture.generatedUrl,
        generatedLine: 0,
        generatedColumn: 9,
      },
      [
        {
          url: fixture.generatedUrl,
          mimeType: "text/javascript",
          content: fixture.generatedContent,
          sourceMapUrl: fixture.mapUrl,
        },
      ],
      {},
    );

    expect(result.generated).toMatchObject({
      availability: { state: "available" },
      provenance: "embedded-resource",
      url: fixture.generatedUrl,
      line: 0,
      column: 9,
      highlightedLine: "function work(){return 42}",
    });
    expect(result.generated.snippet).toContain("function work(){return 42}");
    expect(result.identity.kind).toBe("generated");
  });

  test("maps regular and index source maps while retaining generated fallback on failures", () => {
    for (const kind of ["regular", "index"] as const) {
      const fixture = makeSourceMapFixture(kind);
      const result = resolveTracerSource(
        {
          functionName: "work",
          scriptId: "1",
          generatedUrl: fixture.generatedUrl,
          generatedLine: 0,
          generatedColumn: 9,
        },
        [
          {
            url: fixture.generatedUrl,
            mimeType: "text/javascript",
            content: fixture.generatedContent,
            sourceMapUrl: fixture.mapUrl,
          },
        ],
        { [fixture.mapUrl]: fixture.map },
      );

      expect(result.mappingState).toBe("mapped");
      expect(result.authored).toMatchObject({
        availability: { state: "available" },
        provenance: "source-map",
        url: "webpack:///src/work.ts",
        line: 0,
        column: 9,
        highlightedLine: "export function work() { return 42; }",
      });
      expect(result.generated.availability.state).toBe("available");
      expect(result.identity.kind).toBe("authored");
    }

    const fixture = makeSourceMapFixture();
    const resource = {
      url: fixture.generatedUrl,
      mimeType: "text/javascript",
      content: fixture.generatedContent,
      sourceMapUrl: fixture.mapUrl,
    };
    const malformed = resolveTracerSource(
      {
        functionName: "work",
        scriptId: "1",
        generatedUrl: fixture.generatedUrl,
        generatedLine: 0,
        generatedColumn: 9,
      },
      [resource],
      { [fixture.mapUrl]: "not-json" },
    );
    expect(malformed).toMatchObject({
      mappingState: "malformed",
      mappingFailure: {
        state: "unavailable",
        reason: "malformed-source-map",
      },
      authored: null,
      generated: { availability: { state: "available" } },
    });

    const staleMap = JSON.stringify({
      ...JSON.parse(fixture.map),
      file: "other.js",
    });
    const stale = resolveTracerSource(
      {
        functionName: "work",
        scriptId: "1",
        generatedUrl: fixture.generatedUrl,
        generatedLine: 0,
        generatedColumn: 9,
      },
      [resource],
      { [fixture.mapUrl]: staleMap },
    );
    expect(stale).toMatchObject({
      mappingState: "stale",
      mappingFailure: {
        state: "unavailable",
        reason: "stale-source-map",
      },
      authored: null,
      generated: { availability: { state: "available" } },
    });
  });

  test("keeps exact positions and specific reasons without ambient URI access", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const frame = {
      functionName: "work",
      scriptId: "7",
      generatedUrl: "https://example.test/assets/missing.js",
      generatedLine: 12,
      generatedColumn: 8,
    };

    const missingHttp = resolveTracerSource(frame, [], {});
    expect(missingHttp.generated).toMatchObject({
      url: frame.generatedUrl,
      line: 12,
      column: 8,
      availability: {
        state: "unavailable",
        reason: "missing-source",
        detail: "HTTP source is not embedded; ambient network access is disabled",
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    const missingBlob = resolveTracerSource(
      { ...frame, generatedUrl: "blob:https://example.test/opaque" },
      [],
      {},
    );
    expect(missingBlob.generated.availability).toMatchObject({
      state: "unavailable",
      reason: "blocked-uri",
      detail: "Blob source is not embedded and cannot be dereferenced",
    });

    const dataUrl = "data:text/javascript,function%20work(){}";
    const embeddedData = resolveTracerSource(
      { ...frame, generatedUrl: dataUrl, generatedLine: 0, generatedColumn: 9 },
      [{ url: dataUrl, mimeType: "text/javascript", content: "function work(){}" }],
      {},
    );
    expect(embeddedData.generated.availability.state).toBe("available");

    const ambiguous = resolveTracerSource(frame, [
      { url: frame.generatedUrl, mimeType: "text/javascript", content: "first" },
      { url: frame.generatedUrl, mimeType: "text/javascript", content: "second" },
    ], {});
    expect(ambiguous.generated.availability).toMatchObject({
      state: "unavailable",
      reason: "ambiguous-source",
    });

    const inline = resolveTracerSource(
      {
        ...frame,
        generatedUrl: "",
        documentUrl: "https://example.test/page",
        generatedLine: 0,
        generatedColumn: 0,
      },
      [
        {
          url: "",
          scriptId: "7",
          documentUrl: "https://example.test/page",
          mimeType: "text/javascript",
          content: "inlineWork()",
        },
      ],
      {},
    );
    expect(inline.generated.availability.state).toBe("available");
    expect(inline.identity.kind).toBe("inline");
    vi.unstubAllGlobals();
  });

  test("rejects ambiguous, traversing, and over-depth source maps", () => {
    const fixture = makeSourceMapFixture();
    const resource = {
      url: fixture.generatedUrl,
      mimeType: "text/javascript",
      content: fixture.generatedContent,
      sourceMapUrl: fixture.mapUrl,
    };
    const frame = {
      functionName: "work",
      scriptId: "1",
      generatedUrl: fixture.generatedUrl,
      generatedLine: 0,
      generatedColumn: 0,
    };
    const map = (sources: string[], sourcesContent: string[], mappings: string) => ({
      version: 3,
      file: "app.a1b2c3.js",
      sources,
      sourcesContent,
      names: [],
      mappings,
    });

    const ambiguous = resolveTracerSource(frame, [resource], {
      [fixture.mapUrl]: JSON.stringify(
        map(["src/first.ts", "src/second.ts"], ["first", "second"], "AAAA,ACAA"),
      ),
    });
    expect(ambiguous).toMatchObject({
      mappingState: "ambiguous",
      mappingFailure: { state: "unavailable", reason: "ambiguous-source" },
      generated: { availability: { state: "available" } },
    });

    const traversal = resolveTracerSource(frame, [resource], {
      [fixture.mapUrl]: JSON.stringify(map(["../../secret.ts"], ["secret"], "AAAA")),
    });
    expect(traversal).toMatchObject({
      mappingState: "blocked",
      mappingFailure: { state: "unavailable", reason: "blocked-uri" },
    });

    let nested: Record<string, unknown> = map(["src/work.ts"], ["work"], "AAAA");
    for (let depth = 0; depth < 8; depth++) {
      nested = {
        version: 3,
        file: "app.a1b2c3.js",
        sections: [{ offset: { line: 0, column: 0 }, map: nested }],
      };
    }
    const overDepth = resolveTracerSource(frame, [resource], {
      [fixture.mapUrl]: JSON.stringify(nested),
    });
    expect(overDepth).toMatchObject({
      mappingState: "security-limit",
      mappingFailure: { state: "unavailable", reason: "security-limit" },
    });
  });
});
