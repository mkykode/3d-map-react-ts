import { describe, expect, test } from "vitest";
import { normalizeSourceIdentity } from "../engine/worker/sourceIdentity";

describe("source identity", () => {
  test("keeps same-named authored frames in different files independent", () => {
    const first = normalizeSourceIdentity({
      functionName: "render",
      scriptId: "1",
      generatedUrl: "https://example.test/assets/app.a1b2c3.js",
      generatedLine: 10,
      generatedColumn: 4,
      authored: {
        url: "webpack:///src/first.ts",
        line: 20,
        column: 2,
      },
    });
    const second = normalizeSourceIdentity({
      functionName: "render",
      scriptId: "2",
      generatedUrl: "https://example.test/assets/app.d4e5f6.js",
      generatedLine: 10,
      generatedColumn: 4,
      authored: {
        url: "webpack:///src/second.ts",
        line: 20,
        column: 2,
      },
    });

    expect(first.key).not.toBe(second.key);
    expect(first.kind).toBe("authored");
    expect(second.kind).toBe("authored");
  });

  test("normalizes cache hashes only for generated fallback identity", () => {
    const frame = {
      functionName: "render",
      scriptId: "1",
      generatedLine: 10,
      generatedColumn: 4,
    };
    const first = normalizeSourceIdentity({
      ...frame,
      generatedUrl: "https://example.test/assets/app.a1b2c3d4.js",
    });
    const second = normalizeSourceIdentity({
      ...frame,
      scriptId: "2",
      generatedUrl: "https://example.test/assets/app.ffeeddcc.js",
    });

    expect(first.kind).toBe("generated");
    expect(second.key).toBe(first.key);
  });
});
