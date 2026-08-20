import { expect, test, type Page } from "@playwright/test";
import { makeTraceUpload, openWorkspace } from "./fixtures";

test.setTimeout(300_000);

test("imports every memory-valid 3-5 cohort shape and disposes retained sessions", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Import experiment" }).click();

  for (const [baselineCount, candidateCount] of [
    [3, 3],
    [4, 3],
    [4, 4],
    [5, 5],
  ] as const) {
    await chooseCohort(page, "Baseline traces", "baseline", baselineCount);
    await chooseCohort(page, "Candidate traces", "candidate", candidateCount);
    await page.getByRole("button", { name: "Review experiment" }).click();
    await expect(page.getByRole("heading", { name: "Analysis ready" })).toBeVisible({
      timeout: 90_000,
    });
    await expect(
      page.getByText(`${baselineCount + candidateCount} of ${baselineCount + candidateCount} runs ready`),
    ).toBeVisible();
    await page.getByRole("button", { name: "Dispose experiment" }).click();
    await expect(page.getByText("Experiment disposed from worker memory.")).toBeVisible();
  }
});

test("keeps import responsive and controls keyboard-accessible at 375 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await openWorkspace(page);
  const launch = page.getByRole("button", { name: "Import experiment" });
  await launch.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Controlled experiment" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Close experiment import" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(launch).toBeFocused();
  await launch.click();
  await expect(dialog).toBeVisible();

  await chooseCohort(page, "Baseline traces", "baseline", 3, 1_000);
  await chooseCohort(page, "Candidate traces", "candidate", 3, 1_000);
  await page.evaluate(`(() => {
    window.responsivenessTicks = 0;
    window.setInterval(() => {
      window.responsivenessTicks = (window.responsivenessTicks || 0) + 1;
    }, 20);
  })()`);
  const review = page.getByRole("button", { name: "Review experiment" });
  await review.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("list", { name: "Import progress" }).getByRole("listitem").first(),
  ).toBeVisible();
  await page.waitForTimeout(250);
  expect(
    await page.evaluate<number>("window.responsivenessTicks || 0"),
  ).toBeGreaterThan(2);

  const accessibilityFailures = await page.evaluate<string[]>(`(() => {
    const panel = document.querySelector(".experiment-panel");
    if (!panel) return ["experiment panel missing"];
    const failures = [];
    for (const control of panel.querySelectorAll(
      "button:not([disabled]), input:not([disabled])",
    )) {
      const rect = control.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) failures.push("small target: " + control.tagName);
      const name = control.getAttribute("aria-label") ??
        control.closest("label")?.textContent?.trim() ??
        control.textContent?.trim();
      if (!name) failures.push("unnamed control: " + control.tagName);
    }
    if (panel.scrollWidth > panel.clientWidth + 1) failures.push("panel overflows horizontally");
    return failures;
  })()`);
  expect(accessibilityFailures).toEqual([]);
  await page.getByRole("button", { name: "Cancel import" }).click();
  await expect(page.getByText(/Analysis canceled/)).toBeVisible();
});

async function chooseCohort(
  page: Page,
  label: "Baseline traces" | "Candidate traces",
  cohort: "baseline" | "candidate",
  count: number,
  eventCount = 4,
): Promise<void> {
  await page.getByLabel(label).setInputFiles(
    Array.from({ length: count }, (_, index) =>
      makeTraceUpload({
        runId: `${cohort}-${count}-${index + 1}`,
        eventCount,
      }),
    ),
  );
}
