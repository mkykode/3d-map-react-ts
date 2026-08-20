import { expect, test } from "@playwright/test";
import { makeTraceUpload, openWorkspace } from "./fixtures";

test.setTimeout(90_000);

test("imports and labels a compatible 3+3 controlled experiment", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({ runId: `baseline-${index + 1}` }),
    ),
  );
  await page.getByLabel("Candidate traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({ runId: `candidate-${index + 1}` }),
    ),
  );
  await page.getByLabel("Scenario marker").fill("checkout");
  await page.getByRole("button", { name: "Review experiment" }).click();

  await expect(page.getByRole("heading", { name: "Analysis ready" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("6 of 6 runs ready")).toBeVisible();
  const review = page.getByRole("region", { name: "Analysis ready" });
  await expect(review.getByText("Baseline 1", { exact: true })).toBeVisible();
  await expect(review.getByText("Candidate 3", { exact: true })).toBeVisible();
});

test("blocks cohorts outside 3 to 5 runs before import", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles([
    makeTraceUpload({ runId: "baseline-1" }),
    makeTraceUpload({ runId: "baseline-2" }),
  ]);
  await page.getByLabel("Candidate traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({ runId: `candidate-${index + 1}` }),
    ),
  );

  await expect(
    page.getByText("Baseline and candidate cohorts each require 3 to 5 traces."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Review experiment" })).toBeDisabled();
});

test("blocks incompatible scenarios without producing analysis readiness", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({ runId: `baseline-${index + 1}` }),
    ),
  );
  await page.getByLabel("Candidate traces").setInputFiles([
    makeTraceUpload({ runId: "candidate-1" }),
    makeTraceUpload({ runId: "candidate-2", scenario: "search" }),
    makeTraceUpload({ runId: "candidate-3" }),
  ]);
  await page.getByRole("button", { name: "Review experiment" }).click();

  await expect(page.getByRole("heading", { name: "Analysis blocked" })).toBeVisible();
  await expect(page.getByText(/Selected scenario marker checkout is not present/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Analysis ready" })).toHaveCount(0);
});

test("keeps explicitly accepted capture differences visible", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({ runId: `baseline-${index + 1}` }),
    ),
  );
  await page.getByLabel("Candidate traces").setInputFiles([
    makeTraceUpload({
      runId: "candidate-1",
      captureContext: { throttling: "4x-cpu" },
    }),
    makeTraceUpload({ runId: "candidate-2" }),
    makeTraceUpload({ runId: "candidate-3" }),
  ]);
  await page.getByLabel("Throttling").check();
  await page.getByRole("button", { name: "Review experiment" }).click();

  await expect(page.getByRole("heading", { name: "Analysis ready" })).toBeVisible();
  await expect(page.getByText(/throttling.*(4x-cpu.*none|none.*4x-cpu).*accepted/)).toBeVisible();
  await page.getByRole("button", { name: "Dispose experiment" }).click();
  await expect(page.getByText("Experiment disposed from worker memory.")).toBeVisible();
});

test("reports per-run progress and cancels without a stale manifest", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({ runId: `baseline-${index + 1}`, eventCount: 1_000 }),
    ),
  );
  await page.getByLabel("Candidate traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({ runId: `candidate-${index + 1}`, eventCount: 1_000 }),
    ),
  );
  await page.getByRole("button", { name: "Review experiment" }).click();

  const firstRunProgress = page
    .getByRole("list", { name: "Import progress" })
    .getByRole("listitem")
    .filter({ hasText: "Baseline 1" });
  await expect(firstRunProgress).toContainText(/queued|ingesting|complete/);
  await page.getByRole("button", { name: "Cancel import" }).click();
  await expect(
    page.getByText("Analysis canceled. Imported worker sessions were disposed."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Analysis ready" })).toHaveCount(0);
});

test("cancels cohort analysis without publishing stale findings", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({ runId: `baseline-${index + 1}`, eventCount: 300 }),
    ),
  );
  await page.getByLabel("Candidate traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({ runId: `candidate-${index + 1}`, eventCount: 300 }),
    ),
  );
  await page.getByRole("button", { name: "Review experiment" }).click();
  await expect(page.getByRole("heading", { name: "Analysis ready" })).toBeVisible({
    timeout: 60_000,
  });

  await page.getByRole("button", { name: "Analyze selected domains" }).click();
  await page.getByRole("button", { name: "Cancel import" }).click();

  await expect(
    page.getByText("Analysis canceled. Imported worker sessions were disposed."),
  ).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole("heading", { name: "Regression overview" })).toHaveCount(0);
});
