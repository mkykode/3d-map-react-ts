import { expect, test, type Locator, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { makeTraceUpload, openWorkspace } from "./fixtures";

test.setTimeout(120_000);

test("selects a real instanced multi-domain mark on the primary stage", async ({ page }) => {
  await analyzeExperiment(page);
  await page.getByRole("button", { name: "Close experiment import" }).click();

  const stage = page.getByRole("application", { name: /Interactive 3D regression overview/ });
  await expect(stage).toBeVisible();
  await expect(stage).toHaveAttribute("data-regression-pick-x", /\d/);
  await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
    timeout: 15_000,
  });
  const before = await stage.getAttribute("aria-label");
  await clickProjectedMark(page, stage);

  await expect(stage).toHaveAttribute("aria-label", /Selected finding/);
  expect(await stage.getAttribute("aria-label")).not.toBe(before);
  await expect(stage).toHaveAttribute("data-regression-selected-contributor", /contributor:v1:/);
  await expect(stage).toHaveAttribute("aria-label", /CPU|GPU|network|frame|request|metric|source/i);
  await expect(stage).toHaveAttribute("aria-label", /scale/i);
});

test("next and previous focus real findings on the same stage", async ({ page }) => {
  await analyzeExperiment(page);
  await page.locator(".tracer-mark-actions button").first().click();
  await page.getByRole("button", { name: "Close experiment import" }).click();
  const stage = page.getByRole("application", { name: /Interactive 3D regression overview/ });
  const firstContributor = await selectedContributor(stage);
  expect(firstContributor).toMatch(/^contributor:v1:/);
  const firstRevision = await cameraRevision(stage);

  await page.getByRole("button", { name: "Next finding" }).click();
  await expect.poll(() => selectedContributor(stage)).not.toBe(firstContributor);
  await expect.poll(() => cameraRevision(stage)).toBeGreaterThan(firstRevision);
  const secondContributor = await selectedContributor(stage);

  await page.getByRole("button", { name: "Previous finding" }).click();
  await expect.poll(() => selectedContributor(stage)).toBe(firstContributor);
  expect(secondContributor).not.toBe(firstContributor);
});

test("reduced motion changes finding focus at the final pose without flight", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await analyzeExperiment(page);
  await page.locator(".tracer-mark-actions button").first().click();
  await page.getByRole("button", { name: "Close experiment import" }).click();
  const stage = page.getByRole("application", { name: /Interactive 3D regression overview/ });
  await stage.evaluate((element) => {
    element.dataset.cameraTransitionHistory = element.dataset.cameraTransitioning ?? "";
    const Observer = element.ownerDocument.defaultView?.MutationObserver;
    if (!Observer) throw new Error("MutationObserver unavailable");
    new Observer(() => {
      element.dataset.cameraTransitionHistory += `,${element.dataset.cameraTransitioning}`;
    }).observe(element, { attributes: true, attributeFilter: ["data-camera-transitioning"] });
  });
  const before = await cameraRevision(stage);

  await page.getByRole("button", { name: "Next finding" }).click();

  await expect.poll(() => cameraRevision(stage)).toBeGreaterThan(before);
  await expect(stage).toHaveAttribute("data-camera-transitioning", "false");
  expect(
    (await stage.getAttribute("data-camera-transition-history"))?.split(","),
  ).not.toContain("true");
});

async function analyzeExperiment(page: Page): Promise<void> {
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles(cohort("baseline", 1_000));
  await page.getByLabel("Candidate traces").setInputFiles(cohort("candidate", 4_000));
  await page.getByRole("button", { name: "Review experiment" }).click();
  await expect(page.getByRole("heading", { name: "Analysis ready" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Analyze selected domains" }).click();
  await expect(page.getByRole("heading", { name: "Regression overview" })).toBeVisible();
}

function cohort(prefix: string, taskDurationUs: number) {
  return Array.from({ length: 3 }, (_, index) => {
    const upload = makeTraceUpload({
      runId: `${prefix}-${index + 1}`,
      eventCount: 30,
      taskDurationUs,
      taskSpacingUs: 5_000,
    });
    const envelope = JSON.parse(upload.buffer.toString("utf8")) as {
      traceEvents: { callFrame?: { functionName: string } }[];
    };
    envelope.traceEvents.forEach((event, eventIndex) => {
      if (event.callFrame && eventIndex % 2 === 0) {
        event.callFrame.functionName = "render";
      }
    });
    return { ...upload, buffer: Buffer.from(JSON.stringify(envelope)) };
  });
}

async function clickProjectedMark(page: Page, stage: Locator): Promise<void> {
  await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
    timeout: 15_000,
  });
  const box = await stage.boundingBox();
  if (!box) throw new Error("Regression stage has no bounds");
  const x = Number(await stage.getAttribute("data-regression-pick-x"));
  const y = Number(await stage.getAttribute("data-regression-pick-y"));
  await page.mouse.click(box.x + x, box.y + y);
}

async function selectedContributor(stage: Locator): Promise<string> {
  return (await stage.getAttribute("data-regression-selected-contributor")) ?? "";
}

async function cameraRevision(stage: Locator): Promise<number> {
  return JSON.parse((await stage.getAttribute("data-camera-pose")) ?? "{}").revision ?? 0;
}
