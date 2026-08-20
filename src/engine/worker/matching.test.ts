import { describe, expect, test } from "vitest";
import { semanticIdentity } from "./identity";
import { unionMatchSemanticEntities } from "./matching";

describe("semantic finding matching", () => {
  test("keeps same-named authored and generated source frames independent", () => {
    const authoredA = semanticIdentity({
      kind: "source-frame",
      source: {
        version: 1,
        kind: "authored",
        key: "authored\u0000webpack:///src/a.ts\u0000work\u00000\u00000",
        functionName: "work",
        position: { url: "webpack:///src/a.ts", line: 0, column: 0 },
        generatedPosition: { url: "https://example.test/app.js", line: 0, column: 0 },
      },
    });
    const authoredB = semanticIdentity({
      kind: "source-frame",
      source: {
        version: 1,
        kind: "authored",
        key: "authored\u0000webpack:///src/b.ts\u0000work\u00000\u00000",
        functionName: "work",
        position: { url: "webpack:///src/b.ts", line: 0, column: 0 },
        generatedPosition: { url: "https://example.test/app.js", line: 0, column: 0 },
      },
    });
    const generated = semanticIdentity({
      kind: "source-frame",
      source: {
        version: 1,
        kind: "generated",
        key: "generated\u0000https://example.test/app.js\u0000work\u00000\u00000",
        functionName: "work",
        position: { url: "https://example.test/app.js", line: 0, column: 0 },
        generatedPosition: { url: "https://example.test/app.js", line: 0, column: 0 },
      },
    });

    expect([authoredA, authoredB, generated].map((identity) => identity.key)).toEqual([
      "source-frame:authored:authored\u0000webpack:///src/a.ts\u0000work\u00000\u00000",
      "source-frame:authored:authored\u0000webpack:///src/b.ts\u0000work\u00000\u00000",
      "source-frame:generated:generated\u0000https://example.test/app.js\u0000work\u00000\u00000",
    ]);
    expect(new Set([authoredA.key, authoredB.key, generated.key]).size).toBe(3);
  });

  test("retains the deterministic union of matched, added, removed, and unmatched entities", () => {
    const browser = semanticIdentity({ kind: "browser-domain", domain: "Scripting" });
    const request = semanticIdentity({
      kind: "request",
      method: "GET",
      url: "https://EXAMPLE.test/api/items?batch=1#response",
    });
    const frame = semanticIdentity({ kind: "frame-outcome", outcome: "dropped" });
    const metric = semanticIdentity({ kind: "metric", name: "LCP" });

    const matches = unionMatchSemanticEntities(
      [
        { occurrenceKey: "b-browser", identity: browser, value: 10 },
        { occurrenceKey: "b-request", identity: request, value: 20 },
        { occurrenceKey: "b-metric", identity: metric, value: 30 },
      ],
      [
        { occurrenceKey: "c-browser", identity: browser, value: 11 },
        { occurrenceKey: "c-frame", identity: frame, value: 1 },
        { occurrenceKey: "c-metric", identity: metric, value: 40 },
        { occurrenceKey: "c-unknown", identity: null, value: 50 },
      ],
    );

    expect(request.key).toBe("request:GET:https://example.test/api/items?batch=1");
    expect(matches.map(({ key, status, baseline, candidate }) => ({
      key,
      status,
      baseline: baseline.map((entry) => entry.occurrenceKey),
      candidate: candidate.map((entry) => entry.occurrenceKey),
    }))).toEqual([
      {
        key: "browser-domain:scripting",
        status: "matched",
        baseline: ["b-browser"],
        candidate: ["c-browser"],
      },
      {
        key: "frame-outcome:dropped",
        status: "added",
        baseline: [],
        candidate: ["c-frame"],
      },
      {
        key: "metric:lcp",
        status: "matched",
        baseline: ["b-metric"],
        candidate: ["c-metric"],
      },
      {
        key: "request:GET:https://example.test/api/items?batch=1",
        status: "removed",
        baseline: ["b-request"],
        candidate: [],
      },
      {
        key: "unmatched:candidate:c-unknown",
        status: "unmatched",
        baseline: [],
        candidate: ["c-unknown"],
      },
    ]);
  });

  test("keeps GET and POST requests distinct and rejects an unknown method", () => {
    const url = "https://example.test/api/items";
    const get = semanticIdentity({ kind: "request", method: "GET", url });
    const post = semanticIdentity({ kind: "request", method: "POST", url });

    expect(get.key).toBe("request:GET:https://example.test/api/items");
    expect(post.key).toBe("request:POST:https://example.test/api/items");
    expect(get.key).not.toBe(post.key);
    expect(() => semanticIdentity({ kind: "request", method: null, url })).toThrow(
      "Semantic request method is required",
    );
  });
});
