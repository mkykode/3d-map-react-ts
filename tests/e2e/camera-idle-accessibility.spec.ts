import { expect, test, type Locator } from "@playwright/test";
import { makeTraceUpload, openWorkspace } from "./fixtures";

test.setTimeout(120_000);

test("settled main and regression scenes schedule zero idle frames", async ({
  page,
}) => {
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", {
    timeout: 15_000,
  });
  const stage = page.getByRole("application", { name: "Interactive 3D trace" });
  await expect
    .poll(async () => {
      const pose = JSON.parse(
        (await stage.getAttribute("data-camera-pose")) ?? "{}",
      ) as { target?: number[] };
      const depth = Number(await stage.getAttribute("data-camera-world-depth"));
      return depth > 60
        ? Math.abs((pose.target?.[2] ?? Number.NaN) - depth / 2)
        : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(0.01);
  await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
    timeout: 15_000,
  });
  await expect(stage).toHaveAttribute("data-scene-animating", "false", {
    timeout: 15_000,
  });
  await expectNoIdleFrames(stage);

  await page.getByRole("button", { name: "Import experiment" }).click();
  await page.getByLabel("Baseline traces").setInputFiles(cohort("baseline", 1_000));
  await page.getByLabel("Candidate traces").setInputFiles(cohort("candidate", 4_000));
  await page.getByRole("button", { name: "Review experiment" }).click();
  await expect(page.getByRole("heading", { name: "Analysis ready" })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Analyze selected domains" }).click();
  const regression = page.getByRole("img", {
    name: /3D multi-domain regression overview/i,
  });
  await expect(regression).toHaveAttribute("data-render-count", /\d+/);
  await expectNoIdleFrames(regression);
});

test("camera controls provide keyboard and 375px non-drag parity", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", {
    timeout: 15_000,
  });
  const stage = page.getByRole("application", { name: "Interactive 3D trace" });
  await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
    timeout: 15_000,
  });
  const before = await cameraRevision(stage);
  await stage.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => cameraRevision(stage)).toBeGreaterThan(before);

  await page.getByRole("button", { name: "FunctionCall" }).click();
  for (const name of [
    "Pan left",
    "Pan up",
    "Pan down",
    "Pan right",
    "Zoom out",
    "Zoom in",
    "Turn left",
    "Turn right",
    "Tilt up",
    "Tilt down",
    "Fit all",
    "Fit selection",
    "Reset view",
  ]) {
    const control = page.getByRole("button", { name });
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
    const revision = await cameraRevision(stage);
    await control.click();
    await expect.poll(() => cameraRevision(stage)).toBeGreaterThan(revision);
    await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
      timeout: 15_000,
    });
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  }

  for (const mode of ["Free camera", "Strategy camera"]) {
    const control = page.getByRole("button", { name: mode });
    await control.scrollIntoViewIfNeeded();
    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(control.locator("span[aria-hidden='true']")).toBeVisible();
  }
  for (const plane of ["pan XY", "pan YZ", "pan XZ"]) {
    const control = page.getByRole("button", { name: plane, exact: true });
    await control.scrollIntoViewIfNeeded();
    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(control.locator("span[aria-hidden='true']")).toBeVisible();
  }
  for (const preset of ["top", "side", "orbit"]) {
    const control = page.getByRole("button", { name: preset, exact: true });
    await control.scrollIntoViewIfNeeded();
    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(control.locator("span[aria-hidden='true']")).toBeVisible();
    await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
      timeout: 15_000,
    });
  }

  await expect(page.getByRole("button", { name: "Next finding" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Previous finding" })).toBeDisabled();
  const focusedControl = page.getByRole("button", { name: "Fit all" });
  await page.getByRole("button", { name: "Strategy camera" }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(focusedControl).toBeFocused();
  await expect(focusedControl).toHaveCSS("outline-style", "solid");
  const minimap = page.getByRole("img", {
    name: /Camera orientation\. Position .* Target .* Bearing \d+ degrees/,
  });
  await expect(minimap).toBeVisible();
  const contrast = await minimap.evaluate((element) => {
    const view = element.ownerDocument.defaultView;
    if (!view) throw new Error("Window unavailable");
    const stroke = view.getComputedStyle(element.querySelector("path")!).stroke;
    const fill = view.getComputedStyle(element.querySelector("rect")!).fill;
    return contrastRatio(stroke, fill);

    function contrastRatio(left: string, right: string): number {
      const luminance = (color: string) => {
        const values = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
        const channels = values.map((value) => {
          const normalized = value / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    }
  });
  expect(contrast).toBeGreaterThanOrEqual(3);
  expect(
    await page.locator("html").evaluate((element) => {
      const view = element.ownerDocument.defaultView;
      return view ? element.scrollWidth <= view.innerWidth : false;
    }),
  ).toBe(true);
});

async function expectNoIdleFrames(stage: Locator): Promise<void> {
  const count = async () =>
    Number(await stage.getAttribute("data-render-count"));
  expect(await count()).toBeGreaterThan(0);
  // Async glyph/font readiness (troika typesets through a promise even on the
  // main thread) may schedule bounded one-shot content frames after mount.
  // Those are real content changes, not idle churn: wait for a full quiet
  // interval first, then hold the scene to zero further frames.
  let last = -1;
  await expect
    .poll(
      async () => {
        const current = await count();
        const quiet = current === last;
        last = current;
        return quiet;
      },
      { intervals: [500], timeout: 15_000 },
    )
    .toBe(true);
  await stage.page().waitForTimeout(500);
  expect(await count()).toBe(last);
}

async function cameraRevision(stage: Locator): Promise<number> {
  const raw = await stage.getAttribute("data-camera-pose");
  if (!raw) throw new Error("Camera pose diagnostics are unavailable");
  return (JSON.parse(raw) as { revision: number }).revision;
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
