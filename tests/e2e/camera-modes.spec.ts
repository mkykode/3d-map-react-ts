import { expect, test } from "@playwright/test";
import { makeTraceUpload, openWorkspace } from "./fixtures";

test.setTimeout(120_000);

test("strategy and free camera switches preserve selected experiment evidence", async ({
  page,
}) => {
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
  await page.getByRole("button", { name: "Select regression mark work" }).click();
  await expect(page.locator(".tracer-status")).toContainText(
    "Exact evidence loaded for work",
  );
  const evidenceBefore = await page
    .getByRole("table", { name: "Exact cohort contributors" })
    .textContent();
  await page.getByText("Exact provenance", { exact: true }).click();
  const provenanceBefore = await page.locator(".tracer-provenance").textContent();
  await page.getByRole("button", { name: "Close experiment import" }).click();

  const status = page.getByRole("status", { name: "Camera status" });
  const stage = page.getByRole("application", {
    name: /Interactive 3D regression overview/,
  });
  await expect(status).toContainText("work");
  const strategyPolar = Number(
    await stage.getAttribute("data-camera-max-polar-angle"),
  );
  await page.getByRole("button", { name: "Free camera" }).click();
  await expect(page.getByRole("button", { name: "Free camera" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(stage).toHaveAttribute("data-camera-mode", "free");
  expect(
    JSON.parse((await stage.getAttribute("data-camera-pose")) ?? "{}").mode,
  ).toBe("free");
  expect(
    Number(await stage.getAttribute("data-camera-max-polar-angle")),
  ).toBeGreaterThan(strategyPolar);
  await expect(stage).toHaveAttribute("data-camera-max-distance", "900");
  await expect(status).toContainText("work");
  await page.getByRole("button", { name: "Strategy camera" }).click();
  await expect(stage).toHaveAttribute("data-camera-mode", "strategy");
  expect(
    JSON.parse((await stage.getAttribute("data-camera-pose")) ?? "{}").mode,
  ).toBe("strategy");
  await expect(stage).toHaveAttribute("data-camera-max-distance", "600");
  await expect(status).toContainText("work");

  const serialized = await stage.getAttribute("data-camera-pose");
  expect(serialized).not.toBeNull();
  expect(JSON.parse(serialized ?? "{}")).toMatchObject({
    position: expect.any(Array),
    target: expect.any(Array),
    zoom: expect.any(Number),
    projection: expect.stringMatching(/perspective|orthographic/),
    preset: "orbit",
    mode: "strategy",
  });
  await page.getByRole("button", { name: "Import experiment" }).click();
  await expect(
    page.getByRole("button", { name: "Select regression mark work" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page
      .getByRole("table", { name: "Exact cohort contributors" })
      .textContent(),
  ).toBe(evidenceBefore);
  expect(await page.locator(".tracer-provenance").textContent()).toBe(
    provenanceBefore,
  );
});

test("reduced motion applies final camera and scene poses immediately", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  const stage = page.getByRole("application", { name: "Interactive 3D trace" });
  await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
    timeout: 500,
  });
  await stage.evaluate((element) => {
    element.dataset.cameraTransitionHistory =
      element.dataset.cameraTransitioning ?? "";
    element.dataset.sceneAnimationHistory = element.dataset.sceneAnimating ?? "";
    const Observer = element.ownerDocument.defaultView?.MutationObserver;
    if (!Observer) throw new Error("MutationObserver unavailable");
    new Observer((records: readonly { attributeName: string | null }[]) => {
      for (const record of records) {
        if (record.attributeName === "data-camera-transitioning") {
          element.dataset.cameraTransitionHistory += `,${element.dataset.cameraTransitioning}`;
        }
        if (record.attributeName === "data-scene-animating") {
          element.dataset.sceneAnimationHistory += `,${element.dataset.sceneAnimating}`;
        }
      }
    }).observe(element, {
      attributes: true,
      attributeFilter: ["data-camera-transitioning", "data-scene-animating"],
    });
  });
  await page.getByRole("button", { name: "top", exact: true }).click();
  await expect(stage).toHaveAttribute("data-camera-preset", "top", {
    timeout: 5_000,
  });
  await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
    timeout: 5_000,
  });
  await page.getByRole("button", { name: "Terrain" }).click();
  await expect(stage).toHaveAttribute("data-scene-animating", "false", {
    timeout: 500,
  });

  const fitDestination = await cameraPose(stage);
  await page.getByRole("button", { name: "Pan right" }).click();
  const beforeFit = await movedCameraPose(stage, fitDestination);
  await page.getByRole("button", { name: "Fit all" }).click();
  const afterFit = await changedCameraPose(stage, beforeFit.revision);
  expect(distance(afterFit.target, beforeFit.target)).toBeGreaterThan(0.01);
  expect(distance(afterFit.target, fitDestination.target)).toBeLessThan(0.001);
  await expect(stage).toHaveAttribute("data-camera-action", "fit-all");

  await page.getByRole("button", { name: "Pan left" }).click();
  const beforeReset = await movedCameraPose(stage, afterFit);
  await page.getByRole("button", { name: "Reset view" }).click();
  const afterReset = await changedCameraPose(stage, beforeReset.revision);
  expect(distance(afterReset.target, beforeReset.target)).toBeGreaterThan(0.01);
  expect(distance(afterReset.target, fitDestination.target)).toBeLessThan(0.001);
  await expect(stage).toHaveAttribute("data-camera-action", "reset");

  await expect(stage).toHaveAttribute("data-camera-transitioning", "false");
  await expect(stage).toHaveAttribute("data-scene-animating", "false");
  expect(
    (await stage.getAttribute("data-camera-transition-history"))?.split(","),
  ).not.toContain("true");
  expect(
    (await stage.getAttribute("data-scene-animation-history"))?.split(","),
  ).not.toContain("true");
});

interface CameraPoseSnapshot {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
  revision: number;
}

async function cameraPose(
  stage: import("@playwright/test").Locator,
): Promise<CameraPoseSnapshot> {
  return JSON.parse((await stage.getAttribute("data-camera-pose")) ?? "null");
}

async function changedCameraPose(
  stage: import("@playwright/test").Locator,
  previousRevision: number,
): Promise<CameraPoseSnapshot> {
  await expect
    .poll(async () => (await cameraPose(stage)).revision)
    .toBeGreaterThan(previousRevision);
  return cameraPose(stage);
}

async function movedCameraPose(
  stage: import("@playwright/test").Locator,
  previous: CameraPoseSnapshot,
): Promise<CameraPoseSnapshot> {
  await expect
    .poll(async () => distance((await cameraPose(stage)).target, previous.target))
    .toBeGreaterThan(0.01);
  return cameraPose(stage);
}

function distance(left: readonly number[], right: readonly number[]): number {
  return Math.hypot(...left.map((value, index) => value - right[index]));
}

function cohort(prefix: string, taskDurationUs: number) {
  return Array.from({ length: 3 }, (_, index) =>
    makeTraceUpload({
      runId: `${prefix}-${index + 1}`,
      eventCount: 30,
      taskDurationUs,
      taskSpacingUs: 5_000,
    }),
  );
}
