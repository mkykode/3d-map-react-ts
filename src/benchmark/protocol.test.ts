import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  assertBenchmarkSourceIsolation,
  evaluateSuperiority,
  rankTopThree,
  scoreTopThree,
  validateProtocolBundle,
} from "./protocol";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

describe("preregistered benchmark protocol", () => {
  test("scores only the deterministic top three and fails ties or lower accuracy", () => {
    const tiedRanking = [
      { targetId: "source:z", score: 8 },
      { targetId: "source:b", score: 10 },
      { targetId: "source:a", score: 10 },
      { targetId: "source:c", score: 7 },
    ];

    expect(rankTopThree(tiedRanking).map((target) => target.targetId)).toEqual([
      "source:a",
      "source:b",
      "source:z",
    ]);
    expect(scoreTopThree(tiedRanking, ["source:z"])).toMatchObject({
      correct: true,
      matchedRank: 3,
    });
    expect(scoreTopThree(tiedRanking, ["source:c"])).toMatchObject({
      correct: false,
      matchedRank: null,
    });

    expect(
      evaluateSuperiority({
        traceTopography: [true, true, true, true, true, true, true, true, true, false, false, false],
        devTools: [true, true, true, true, true, true, true, true, false, false, false, false],
      }).gate,
    ).toBe("pass");
    expect(
      evaluateSuperiority({
        traceTopography: [true, true, false, false],
        devTools: [true, true, false, false],
      }).gate,
    ).toBe("fail-tie");
    expect(
      evaluateSuperiority({
        traceTopography: [true, false, false, false],
        devTools: [true, true, false, false],
      }).gate,
    ).toBe("fail-lower");
  });

  test("validates the frozen unlabeled corpus, policy, commitment, and source isolation", () => {
    const preregistration = readJson("benchmarks/preregistration.json");
    const estimatorPolicy = readJson("benchmarks/estimator-policy.json");
    const tuningManifest = readJson("benchmarks/tuning/manifest.json");
    const knownRegressions = readJson("benchmarks/known-regressions/manifest.json");
    const heldOutIndex = readJson("benchmarks/held-out/index.json");
    const commitment = readFileSync(
      join(ROOT, "benchmarks/commitments/ground-truth.sha256"),
      "utf8",
    ).trim();

    expect(
      validateProtocolBundle({
        preregistration,
        estimatorPolicy,
        tuningManifest,
        knownRegressions,
        heldOutIndex,
        commitment,
      }),
    ).toMatchObject({
      corpusId: "held-out-v1",
      caseCount: 12,
      envelopeCount: 72,
      commitment,
    });

    const index = heldOutIndex as HeldOutIndex;
    for (const benchmarkCase of index.cases) {
      for (const run of [...benchmarkCase.baseline, ...benchmarkCase.candidate]) {
        const path = join(ROOT, "benchmarks/held-out", run.path);
        expect(statSync(path).size).toBe(run.bytes);
        expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(
          run.sha256,
        );
      }
    }

    expect(() =>
      assertBenchmarkSourceIsolation(productionSourceFiles(join(ROOT, "src"))),
    ).not.toThrow();
    expect(() =>
      assertBenchmarkSourceIsolation([
        {
          path: "src/engine/worker/ranking.ts",
          content: 'import seal from "../../../benchmarks/commitments/ground-truth.sha256";',
        },
      ]),
    ).toThrow("Benchmark source isolation violation");
    expect(() =>
      assertBenchmarkSourceIsolation([
        {
          path: "src/App.tsx",
          content: 'fetch("../benchmarks/held-out/index.json")',
        },
      ]),
    ).toThrow("Benchmark source isolation violation");
  });
});

interface HeldOutIndex {
  cases: {
    baseline: { path: string; bytes: number; sha256: string }[];
    candidate: { path: string; bytes: number; sha256: string }[];
  }[];
}

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, relativePath), "utf8")) as unknown;
}

function productionSourceFiles(path: string): { path: string; content: string }[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      if (entryPath === join(ROOT, "src/benchmark")) return [];
      return productionSourceFiles(entryPath);
    }
    if (!/\.(?:ts|tsx)$/.test(entry.name) || entry.name.endsWith(".test.ts")) {
      return [];
    }
    return [{ path: entryPath, content: readFileSync(entryPath, "utf8") }];
  });
}
