import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Buffer } from "node:buffer";
import { makeTraceUpload, openWorkspace } from "./fixtures";

test.setTimeout(120_000);
test.use({ hasTouch: true });

test("round-trips a stable evidence identity between findings and Diff 3D", async ({
  page,
}) => {
  await analyzeFixture(page);
  const panel = page.getByRole("region", { name: "Ranked findings" });
  const findingButtons = panel.locator(".finding-select");
  expect(await findingButtons.count()).toBeGreaterThan(1);
  const finding = findingButtons.first();
  const originalEvidenceId = await finding.getAttribute("data-evidence-id");
  expect(originalEvidenceId).toMatch(/^evidence:v1:/);
  await finding.evaluate((button) => {
    let started = 0;
    button.addEventListener("click", () => {
      started = performance.now();
    }, { capture: true, once: true });
    button.addEventListener("click", () => {
      button.ownerDocument.defaultView?.requestAnimationFrame(() => {
        button.dataset.browserVisibleFocusMs = String(performance.now() - started);
      });
    }, { once: true });
  });
  await finding.click();
  await expect(finding).toHaveAttribute("aria-pressed", "true");
  await expect(finding.getByText("Selected", { exact: true })).toBeVisible();
  await expect(finding).toHaveAttribute("data-browser-visible-focus-ms", /\d/);
  const durationMs = Number(await finding.getAttribute("data-browser-visible-focus-ms"));
  expect(durationMs).toBeLessThan(100);

  await page.getByRole("button", { name: "Close experiment import" }).click();
  const stage = page.getByRole("application", {
    name: /Interactive 3D regression overview/,
  });
  await expect(stage).toBeVisible();
  await page.getByRole("button", { name: "Next finding" }).click();
  await expect(stage).toHaveAttribute(
    "data-regression-selected-evidence",
    /evidence:v1:/,
  );
  await expect
    .poll(() => stage.getAttribute("data-regression-selected-evidence"))
    .not.toBe(originalEvidenceId);
  const targetEvidenceId = await stage.getAttribute(
    "data-regression-selected-evidence",
  );
  expect(targetEvidenceId).toBeTruthy();
  await expect(stage).toHaveAccessibleName(
    new RegExp(`Selected evidence ${targetEvidenceId}`),
  );

  await page.getByRole("button", { name: "Import experiment" }).click();
  const reopenedPanel = page.getByRole("region", { name: "Ranked findings" });
  const targetFinding = reopenedPanel.locator(
    `.finding-select[data-evidence-id="${targetEvidenceId}"]`,
  );
  await expect(targetFinding).toHaveAttribute("aria-pressed", "true");
  const originalFinding = reopenedPanel.locator(
    `.finding-select[data-evidence-id="${originalEvidenceId}"]`,
  );
  await originalFinding.click();
  await expect(originalFinding).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close experiment import" }).click();
  await expect(stage).toHaveAccessibleName(
    new RegExp(`Selected evidence ${originalEvidenceId}`),
  );
});

test("keeps the findings workflow touch-operable and free of automated WCAG violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await analyzeFixture(page);
  const panel = page.getByRole("region", { name: "Ranked findings" });
  await panel.getByRole("button").first().tap();
  await expect(page.getByRole("region", { name: "Exact finding provenance" })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include(".findings-panel")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  await panel.getByRole("button", { name: "Show selected finding in 3D" }).tap();
  await page.getByRole("button", { name: "Close experiment import" }).tap();
  await expect(page.getByRole("application", { name: /Selected evidence evidence:v1:/ }))
    .toBeVisible();
});

test("keeps finding selection and evidence reveal reachable at 375px without drag", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await analyzeFixture(page);
  const panel = page.getByRole("region", { name: "Ranked findings" });
  const finding = panel.getByRole("button").first();
  await finding.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Exact finding provenance" })).toBeVisible();

  const reveal = panel.getByRole("button", { name: "Show selected finding in 3D" });
  await reveal.focus();
  await page.keyboard.press("Enter");

  const failures = await page.evaluate<string[]>(`(() => {
    const panel = document.querySelector(".findings-panel");
    if (!panel) return ["findings panel missing"];
    const failures = [];
    if (panel.scrollWidth > panel.clientWidth + 1) failures.push("horizontal overflow");
    for (const control of panel.querySelectorAll("button:not([disabled])")) {
      const rect = control.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) failures.push("small target");
      if (!(control.textContent || control.getAttribute("aria-label"))) {
        failures.push("unnamed control");
      }
    }
    return failures;
  })()`);
  expect(failures).toEqual([]);
  await page.getByRole("button", { name: "Close experiment import" }).click();
  await expect(
    page.getByRole("application", { name: /Selected evidence evidence:v1:/ }),
  ).toBeVisible();
});

async function analyzeFixture(page: Page): Promise<void> {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeMultiMarkTraceUpload({
        runId: `baseline-quality-${index + 1}`,
        eventCount: 30,
        taskDurationUs: 1_000,
        taskSpacingUs: 5_000,
      })),
  );
  await page.getByLabel("Candidate traces").setInputFiles(
    Array.from({ length: 3 }, (_, index) =>
      makeMultiMarkTraceUpload({
        runId: `candidate-quality-${index + 1}`,
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
  await expect(page.getByRole("region", { name: "Ranked findings" })).toBeVisible();
  await expect(page.locator("#app-status")).toHaveAttribute("role", "status");
  await expect(page.locator("#app-error")).toHaveAttribute("role", "alert");
}

function makeMultiMarkTraceUpload(options: {
  runId: string;
  eventCount: number;
  taskDurationUs: number;
  taskSpacingUs: number;
}) {
  const upload = makeTraceUpload(options);
  const envelope = JSON.parse(upload.buffer.toString("utf8")) as {
    traceEvents: { callFrame?: { functionName: string } }[];
  };
  const sourceEvents = envelope.traceEvents.filter((event) => event.callFrame);
  sourceEvents.slice(Math.floor(sourceEvents.length / 2)).forEach((event) => {
    event.callFrame!.functionName = "secondaryWork";
  });
  return { ...upload, buffer: Buffer.from(JSON.stringify(envelope)) };
}
