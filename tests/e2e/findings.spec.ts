import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { makeTraceUpload, openWorkspace } from "./fixtures";

test.setTimeout(120_000);

test("defaults to all Phase 5 domains and exposes honest domain selection", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Import experiment" }).click();
  const domains = page.getByRole("group", { name: "Finding domains" });
  for (const name of ["CPU source", "Browser", "Network", "Frames", "Metrics"]) {
    await expect(domains.getByRole("checkbox", { name })).toBeChecked();
  }
  await domains.getByRole("checkbox", { name: "Browser" }).uncheck();
  await expect(domains.getByRole("checkbox", { name: "Browser" })).not.toBeChecked();
});

test("shows complete cohort effects for each ranked finding", async ({ page }) => {
  await analyzeFixture(page);

  const panel = page.getByRole("region", { name: "Ranked findings" });
  await expect(panel).toBeVisible();
  const firstFinding = panel.getByRole("listitem").first();
  await expect(firstFinding).toContainText(/Baseline\s*30 ms/);
  await expect(firstFinding).toContainText(/Candidate\s*120 ms/);
  await expect(firstFinding).toContainText(/Effect\s*\+90 ms/);
  await expect(firstFinding).toContainText(/Relative\s*\+300%/);
  await expect(firstFinding).toContainText(/Dispersion\s*0 ms/);
  await expect(firstFinding).toContainText(/Samples\s*3 \/ 3/);
  await expect(firstFinding).toContainText(/Completeness\s*100% \/ 100%/);
  await expect(firstFinding).toContainText(
    /Evidence quality\s*Authored source \(100%\)/,
  );
});

test("keeps same-named source frames from different files independent", async ({ page }) => {
  await analyzeSourceSwap(page);

  const findings = page.getByRole("region", { name: "Ranked findings" });
  await expect(findings.getByText("webpack:///src/a.ts", { exact: false })).toBeVisible();
  await expect(findings.getByText("webpack:///src/b.ts", { exact: false })).toBeVisible();
  await expect(findings.getByRole("listitem").filter({ hasText: "src/a.ts" })).toContainText(
    "removed",
  );
  await expect(findings.getByRole("listitem").filter({ hasText: "src/b.ts" })).toContainText(
    "added",
  );
});

test("keeps union-only entities visible with explicit unknown missingness", async ({ page }) => {
  await analyzeSourceSwap(page);

  const added = page
    .getByRole("region", { name: "Ranked findings" })
    .getByRole("listitem")
    .filter({ hasText: "src/b.ts" });
  await expect(added).toContainText(/Baseline\s*Unknown/);
  await expect(added).toContainText(
    /Missingness\s*Unknown · 3 baseline missing · 0 candidate missing/,
  );
});

test("explains why a noisy positive effect is not promoted", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({
        runId: `baseline-noise-${index + 1}`,
        eventCount: 30,
        taskDurationUs: 1_000,
        taskSpacingUs: 12_000,
      })),
  );
  await page.getByLabel("Candidate traces").setInputFiles(
    [1_000, 3_000, 10_000].map((taskDurationUs, index) =>
      makeTraceUpload({
        runId: `candidate-noise-${index + 1}`,
        eventCount: 30,
        taskDurationUs,
        taskSpacingUs: 12_000,
      })),
  );
  await page.getByRole("button", { name: "Review experiment" }).click();
  await expect(page.getByRole("heading", { name: "Analysis ready" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Analyze selected domains" }).click();

  const finding = page
    .getByRole("region", { name: "Ranked findings" })
    .getByRole("listitem")
    .first();
  await expect(finding).toContainText("inconclusive");
  await expect(finding).toContainText(/Dispersion\s*88.96 ms/);
  await expect(finding).toContainText(
    /Not promoted.*Effect does not exceed 2x dispersion/,
  );
});

test("opens exact finding provenance from keyboard selection", async ({ page }) => {
  await analyzeFixture(page);
  const panel = page.getByRole("region", { name: "Ranked findings" });
  const finding = panel.getByRole("button").first();
  await finding.focus();
  await page.keyboard.press("Enter");

  const provenance = page.getByRole("region", { name: "Exact finding provenance" });
  await expect(provenance).toBeVisible();
  await expect(provenance).toContainText("Scenario marker checkout, occurrence 1");
  await expect(provenance).toContainText("session:v1:client-");
  await expect(provenance).toContainText("Import SHA-256");
  await expect(provenance).toContainText("Payload SHA-256");
  await expect(provenance).toContainText("Event identities");
  await expect(provenance).toContainText(/normalConsistencyScale\s*1.4826/);
  await expect(provenance).toContainText(/Mapping state\s*mapped/);
});

async function analyzeSourceSwap(page: Page): Promise<void> {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      sourceTraceUpload(`baseline-source-${index + 1}`, "webpack:///src/a.ts", 1_000)),
  );
  await page.getByLabel("Candidate traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      sourceTraceUpload(`candidate-source-${index + 1}`, "webpack:///src/b.ts", 4_000)),
  );
  await page.getByRole("button", { name: "Review experiment" }).click();
  await expect(page.getByRole("heading", { name: "Analysis ready" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Analyze selected domains" }).click();
}

async function analyzeFixture(page: Page): Promise<void> {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({
        runId: `baseline-${index + 1}`,
        eventCount: 30,
        taskDurationUs: 1_000,
        taskSpacingUs: 5_000,
      })),
  );
  await page.getByLabel("Candidate traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({
        runId: `candidate-${index + 1}`,
        eventCount: 30,
        taskDurationUs: 4_000,
        taskSpacingUs: 5_000,
      })),
  );
  await page.getByRole("button", { name: "Review experiment" }).click();
  await expect(page.getByRole("heading", { name: "Analysis ready" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Analyze selected domains" }).click();
}

function sourceTraceUpload(runId: string, authoredUrl: string, taskDurationUs: number) {
  const upload = makeTraceUpload({
    runId,
    eventCount: 30,
    taskDurationUs,
    taskSpacingUs: 5_000,
  });
  const envelope = JSON.parse(upload.buffer.toString("utf8")) as {
    resources: { url: string; content: string; mimeType: string }[];
    sourceMaps: Record<string, string>;
  };
  const [mapUrl, mapContent] = Object.entries(envelope.sourceMaps)[0];
  const sourceMap = JSON.parse(mapContent) as { sources: string[] };
  sourceMap.sources = [authoredUrl];
  const updatedMap = JSON.stringify(sourceMap);
  envelope.sourceMaps[mapUrl] = updatedMap;
  const mapResource = envelope.resources.find((resource) => resource.url === mapUrl);
  if (mapResource) mapResource.content = updatedMap;
  return { ...upload, buffer: Buffer.from(JSON.stringify(envelope)) };
}
