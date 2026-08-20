import { describe, expect, test } from "vitest";
import {
  makeFiveByFiveExperiment,
  makeFourByFourExperiment,
  makeFourByThreeExperiment,
  makeOverCardinalityExperiment,
  makeThreeByThreeExperiment,
  makeUnderCardinalityExperiment,
} from "./experimentFixtures";
import {
  encodeEnvelopeFixture,
  makeFullEnvelopeFixture,
  makeSourceMapFixture,
} from "./traceEnvelopeFixtures";
import {
  makeCompressionBombFixture,
  makeMalformedPayloadFixtures,
  makeOversizedInputFixture,
  makeTraversalFixtures,
} from "./untrustedInputFixtures";

describe("deterministic fixture builders", () => {
  test("builds stable full envelopes and source maps", () => {
    const first = makeFullEnvelopeFixture();
    const second = makeFullEnvelopeFixture();

    expect(encodeEnvelopeFixture(first)).toEqual(encodeEnvelopeFixture(second));
    expect(JSON.parse(makeSourceMapFixture("regular").map)).toMatchObject({
      version: 3,
      sources: ["webpack:///src/work.ts"],
    });
    expect(JSON.parse(makeSourceMapFixture("index").map).sections).toHaveLength(1);
  });

  test("builds every supported and rejected cohort cardinality", () => {
    expect(makeThreeByThreeExperiment()).toMatchObject({ baseline: { length: 3 }, candidate: { length: 3 } });
    expect(makeFourByThreeExperiment()).toMatchObject({ baseline: { length: 4 }, candidate: { length: 3 } });
    expect(makeFourByFourExperiment()).toMatchObject({ baseline: { length: 4 }, candidate: { length: 4 } });
    expect(makeFiveByFiveExperiment()).toMatchObject({ baseline: { length: 5 }, candidate: { length: 5 } });
    expect(makeUnderCardinalityExperiment()).toMatchObject({ baseline: { length: 2 } });
    expect(makeOverCardinalityExperiment()).toMatchObject({ candidate: { length: 6 } });
  });

  test("builds bounded representations of hostile inputs", async () => {
    const virtualInput = makeOversizedInputFixture(130_000, 64_000);
    const chunks: Uint8Array[] = [];
    for await (const chunk of virtualInput.chunks()) chunks.push(chunk);

    expect(chunks.map((chunk) => chunk.byteLength)).toEqual([64_000, 64_000, 2_000]);
    const bomb = await makeCompressionBombFixture();
    expect(bomb.compressed.byteLength).toBeLessThan(bomb.decompressedBytes / 100);
    expect(makeTraversalFixtures()).toHaveLength(4);
    expect(makeMalformedPayloadFixtures()).toHaveLength(5);
  });
});
