import { expect, test } from "@playwright/test";
import { makeTraceUpload, openWorkspace } from "./fixtures";

test.setTimeout(120_000);

test("selects one 3D CPU/source mark and opens exact table and source proof", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({
        runId: `baseline-${index + 1}`,
        eventCount: 30,
        taskDurationUs: 1_000,
        taskSpacingUs: 5_000,
      }),
    ),
  );
  await page.getByLabel("Candidate traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeTraceUpload({
        runId: `candidate-${index + 1}`,
        eventCount: 30,
        taskDurationUs: 4_000,
        taskSpacingUs: 5_000,
      }),
    ),
  );
  const domains = page.getByRole("group", { name: "Finding domains" });
  for (const name of ["Browser", "Network", "Frames", "Metrics"]) {
    await domains.getByRole("checkbox", { name }).uncheck();
  }
  await page.getByRole("button", { name: "Review experiment" }).click();
  await expect(page.getByRole("heading", { name: "Analysis ready" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator(".experiment-status")).toContainText(
    "Experiment review complete. Analysis ready.",
  );
  await page.getByRole("button", { name: "Analyze selected domains" }).click();

  await expect(page.getByRole("heading", { name: "Regression overview" })).toBeVisible();
  await expect(page.locator(".experiment-status")).toContainText(
    "Selected-domain analysis complete. 1 finding ready.",
  );
  await expect(
    page.getByRole("img", {
      name: /source work.*regression.*baseline 30 ms.*candidate 120 ms.*delta \+90 ms/i,
    }),
  ).toBeVisible();
  await expect(page.locator(".tracer-summary")).toContainText("Relative delta300%");
  await expect(page.locator(".tracer-summary")).toContainText("Dispersion0 ms");
  await expect(page.locator(".tracer-summary")).toContainText(
    "CompletenessBaseline 100% · Candidate 100%",
  );
  await expect(page.locator(".tracer-summary")).toContainText(
    "Samples3 baseline · 3 candidate",
  );
  const mark = page.getByRole("button", { name: "Select regression mark work" });
  await mark.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("table", { name: "Exact cohort contributors" })).toBeVisible();
  await expect(page.locator(".tracer-status")).toContainText(
    "Exact evidence loaded for work.",
  );
  await expect(page.getByRole("row", { name: /Baseline 1.*30 ms/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Candidate 3.*120 ms/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Generated source" })).toBeVisible();
  await expect(page.getByText("function work(){return 42}", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Authored source" })).toBeVisible();
  await expect(page.getByText("export function work() { return 42; }")).toBeVisible();
  await expect(
    page.locator(".source-position").filter({ hasText: "webpack:///src/work.ts" }),
  ).toBeVisible();
  await expect(page.getByText(/Source content from Candidate run session:v1:/)).toBeVisible();
  await page.getByText("Exact provenance", { exact: true }).click();
  await expect(page.locator(".tracer-provenance")).toContainText(
    "Scenario marker checkout, occurrence 1",
  );
  await expect(page.locator(".tracer-provenance")).toContainText("Event keys");
  await expect(page.locator(".tracer-provenance")).toContainText(
    /promotionDispersionMultiplier:\s*2/,
  );
  const exactValueCell = page.getByRole("cell", { name: /session:v1:/ }).first();
  await expect(exactValueCell).toHaveCSS("white-space", "normal");
  await expect(exactValueCell).not.toHaveCSS("text-overflow", "ellipsis");
  await expect(page.getByText("Exact source line:", { exact: true }).first()).toBeAttached();
  await expect(page.locator(".source-snippet mark").first()).toHaveCSS(
    "border-left-width",
    "3px",
  );
});
