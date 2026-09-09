import { expect, test, type Locator } from "@playwright/test";
import { makeTraceUpload, openWorkspace } from "./fixtures";

test.setTimeout(120_000);

test("fit, trace-selection focus, and reset keep selected evidence intact", async ({
  page,
}) => {
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  const stage = page.getByRole("application", { name: "Interactive 3D trace" });
  await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
    timeout: 15_000,
  });

  const selectedRow = page.locator(".bottomup tbody tr").first();
  await selectedRow.click();
  await expect(selectedRow).toHaveClass(/selected/);

  for (const name of ["Fit all", "Fit selection", "Reset view"]) {
    const revision = await cameraRevision(stage);
    await page.getByRole("button", { name }).click();
    await expect
      .poll(() => cameraRevision(stage))
      .toBeGreaterThan(revision);
    await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
      timeout: 15_000,
    });
    await expect(selectedRow).toHaveClass(/selected/);
  }
});

test("a genuinely single-mark experiment leaves next and previous unavailable", async ({
  page,
}) => {
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles(
    cohort("baseline", 1_000),
  );
  await page.getByLabel("Candidate traces").setInputFiles(
    cohort("candidate", 4_000),
  );
  await page.getByRole("button", { name: "Review experiment" }).click();
  await expect(page.getByRole("heading", { name: "Analysis ready" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Analyze selected domains" }).click();
  await expect(page.getByRole("heading", { name: "Regression overview" })).toBeVisible();
  await page.getByRole("button", { name: "Select regression mark work" }).click();
  await page.getByRole("button", { name: "Close experiment import" }).click();

  for (const name of ["Next finding", "Previous finding"]) {
    const control = page.getByRole("button", { name });
    await expect(control).toBeDisabled();
  }
});

test("top and side actions settle before later wheel and keyboard input", async ({
  page,
}) => {
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  const stage = page.getByRole("application", { name: "Interactive 3D trace" });
  await expect
    .poll(async () => {
      const pose = JSON.parse(
        (await stage.getAttribute("data-camera-pose")) ?? "{}",
      ) as CameraPose;
      const bounds = JSON.parse((await stage.getAttribute("data-camera-bounds")) ?? "null");
      const depth = bounds?.max[2] ?? 0;
      return depth > 60
        ? Math.abs(pose.target[2] - (depth + bounds.min[2]) / 2)
        : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(0.01);
  await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
    timeout: 15_000,
  });

  for (const preset of ["top", "side"] as const) {
    await page.getByRole("button", { name: preset, exact: true }).click();
    await expect(stage).toHaveAttribute("data-camera-preset", preset);
    await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Fit all" }).click();
    await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
      timeout: 15_000,
    });

    const beforeKey = await cameraRevision(stage);
    await stage.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => cameraRevision(stage)).toBeGreaterThan(beforeKey);

    const beforeWheel = await cameraRevision(stage);
    await stage.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const Wheel = element.ownerDocument.defaultView?.WheelEvent;
      if (!Wheel) throw new Error("WheelEvent unavailable");
      element.dispatchEvent(
        new Wheel("wheel", {
          bubbles: true,
          cancelable: true,
          deltaMode: 0,
          deltaY: 4,
          clientX: bounds.left + bounds.width / 2,
          clientY: bounds.top + bounds.height / 2,
        }),
      );
    });
    await expect.poll(() => cameraRevision(stage)).toBeGreaterThan(beforeWheel);
  }
});

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

async function cameraRevision(stage: Locator): Promise<number> {
  const raw = await stage.getAttribute("data-camera-pose");
  if (!raw) throw new Error("Camera pose diagnostics are unavailable");
  return (JSON.parse(raw) as { revision: number }).revision;
}

interface CameraPose {
  target: [number, number, number];
}
