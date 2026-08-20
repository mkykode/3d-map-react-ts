import type { Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { makeFullEnvelopeFixture } from "../../src/test/traceEnvelopeFixtures";

export const DEMO_URL = "/demo-trace.json";

export function makeTraceUpload(options?: {
  runId?: string;
  scenario?: string;
  eventCount?: number;
  taskDurationUs?: number;
  taskSpacingUs?: number;
  captureContext?: {
    browserContext?: string;
    throttling?: string;
    navigationOwnership?: string;
  };
}): { name: string; mimeType: string; buffer: Buffer } {
  const runId = options?.runId ?? "e2e-run-1";
  const envelope = makeFullEnvelopeFixture({
    runId,
    scenario: options?.scenario,
    eventCount: options?.eventCount,
    taskDurationUs: options?.taskDurationUs,
    taskSpacingUs: options?.taskSpacingUs,
    captureContext: options?.captureContext,
  });
  return {
    name: `${runId}.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(envelope)),
  };
}

export interface EvidenceCaseFixture {
  schemaVersion: 1;
  id: string;
  findingId: string;
  scope: { scenario: string; baselineRunIds: string[]; candidateRunIds: string[] };
  evidence: { id: string; kind: "source"; content: string }[];
}

export function makeEvidenceCaseFixture(): EvidenceCaseFixture {
  return {
    schemaVersion: 1,
    id: "case-checkout-regression",
    findingId: "finding-source-work",
    scope: {
      scenario: "checkout",
      baselineRunIds: ["baseline-1", "baseline-2", "baseline-3"],
      candidateRunIds: ["candidate-1", "candidate-2", "candidate-3"],
    },
    evidence: [
      {
        id: "source-work-generated",
        kind: "source",
        content: "function work(){return 42}",
      },
    ],
  };
}

export async function openWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByText("Trace Topography", { exact: true }).waitFor();
}
