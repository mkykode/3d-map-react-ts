import { expect, test, type Locator } from "@playwright/test";
import { openWorkspace } from "./fixtures";
import type { SceneDebugHost } from "../../src/scene/diagnostics";
import type { CameraControlsHandle } from "../../src/scene/cameraFlight";

test.setTimeout(120_000);

interface CameraPoseSnapshot {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
  preset: string;
  revision: number;
}

test("trackpad, pinch, and pointer gestures preserve their camera invariants", async ({
  page,
}) => {
  await openWorkspace(page);
  const stage = page.getByRole("application", { name: "Interactive 3D trace" });
  await waitForLoadedCamera(page, stage);

  const beforeLeft = await cameraPose(stage);
  await dispatchWheel(stage, { deltaX: -28, deltaY: 0 });
  const afterLeft = await changedCameraPose(stage, beforeLeft.revision);
  expect(
    dot(subtract(afterLeft.target, beforeLeft.target), cameraBasis(beforeLeft).right),
  ).toBeGreaterThan(0);
  await dispatchWheel(stage, { deltaX: 56, deltaY: 0 });
  const afterRight = await changedCameraPose(stage, afterLeft.revision);
  expect(
    dot(subtract(afterRight.target, afterLeft.target), cameraBasis(afterLeft).right),
  ).toBeLessThan(0);

  await dispatchWheel(stage, { deltaY: -80, deltaYs: [-80, -70] });
  const afterUp = await changedCameraPose(stage, afterRight.revision);
  expect(
    dot(subtract(afterUp.target, afterRight.target), cameraBasis(afterRight).up),
  ).toBeLessThan(0);
  await page.waitForTimeout(100);
  await dispatchWheel(stage, { deltaY: 160, deltaYs: [160, 140] });
  await expect
    .poll(async () => Number(await stage.getAttribute("data-camera-last-pan-delta-y")))
    .toBeGreaterThan(0);
  const afterDown = await cameraPose(stage);
  expect(
    dot(subtract(afterDown.target, afterUp.target), cameraBasis(afterUp).up),
  ).toBeGreaterThan(0);
  expect(distance(afterDown.position, afterDown.target)).toBeCloseTo(
    distance(beforeLeft.position, beforeLeft.target),
    4,
  );

  await page.waitForTimeout(100);
  const beforeDiscreteWheel = await cameraPose(stage);
  await dispatchWheel(stage, { deltaY: 4 });
  const afterDiscreteWheel = await changedCameraPose(
    stage,
    beforeDiscreteWheel.revision,
  );
  expect(distance(afterDiscreteWheel.position, afterDiscreteWheel.target)).not.toBeCloseTo(
    distance(beforeDiscreteWheel.position, beforeDiscreteWheel.target),
    4,
  );

  await page.waitForTimeout(100);
  const beforeRapidWheel = await cameraPose(stage);
  const targetFocus = await stage.evaluate((host: SceneDebugHost) => {
    const root = host.traceScene!();
    const target = (root.controls as CameraControlsHandle).target.clone().project(root.camera);
    return { focusXRatio: (target.x + 1) / 2, focusYRatio: (1 - target.y) / 2 };
  });
  await dispatchWheel(stage, { deltaY: -4, repeat: 2, ...targetFocus });
  const afterRapidWheel = await changedCameraPose(
    stage,
    beforeRapidWheel.revision,
  );
  await expect(stage).toHaveAttribute("data-camera-last-wheel-decision", "zoom");
  expect(distance(afterRapidWheel.target, beforeRapidWheel.target)).toBeLessThan(0.1);
  expect(distance(afterRapidWheel.position, afterRapidWheel.target)).toBeLessThan(
    distance(beforeRapidWheel.position, beforeRapidWheel.target),
  );

  await dispatchWheel(stage, {
    ctrlKey: true,
    deltaY: -8,
    focusXRatio: 0.72,
    focusYRatio: 0.34,
  });
  const afterPinch = await changedCameraPose(stage, afterRapidWheel.revision);
  expect(distance(afterPinch.position, afterPinch.target)).toBeLessThan(
    distance(afterDiscreteWheel.position, afterDiscreteWheel.target),
  );
  await expect(stage).toHaveAttribute("data-camera-focus-error", /^0(?:\.0+)?$/);

  const box = await stage.boundingBox();
  if (!box) throw new Error("Camera stage has no bounding box");
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.56, {
    steps: 4,
  });
  await page.mouse.up();
  const beforeOrbitTarget = [...afterPinch.target];
  const beforeOrbitDirection = normalizedDirection(afterPinch);
  const afterOrbit = await changedCameraPose(stage, afterPinch.revision);
  expect(distance(afterOrbit.target, beforeOrbitTarget)).toBeLessThan(0.001);
  expect(distance(normalizedDirection(afterOrbit), beforeOrbitDirection)).toBeGreaterThan(0.01);

  for (const preset of ["top", "side"] as const) {
    await page.getByRole("button", { name: preset, exact: true }).click();
    await expect(stage).toHaveAttribute("data-camera-preset", preset);
    await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
      timeout: 15_000,
    });
    const beforeDrag = await cameraPose(stage);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.58, {
      steps: 4,
    });
    await page.mouse.up();
    const afterDrag = await changedCameraPose(stage, beforeDrag.revision);
    expect(distance(afterDrag.target, beforeDrag.target)).toBeGreaterThan(0.01);
    expect(vectorBetween(afterDrag.position, afterDrag.target)).toEqual(
      vectorBetween(beforeDrag.position, beforeDrag.target),
    );
  }
});

test("emulated one-touch orbit and two-touch pinch remain reachable", async ({
  page,
}) => {
  await openWorkspace(page);
  const stage = page.getByRole("application", { name: "Interactive 3D trace" });
  await waitForLoadedCamera(page, stage);
  const bounds = await stage.boundingBox();
  if (!bounds) throw new Error("Camera stage has no bounding box");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 2,
  });

  const beforeOrbit = await cameraPose(stage);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: bounds.x + 180, y: bounds.y + 160 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: bounds.x + 230, y: bounds.y + 190 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const afterOrbit = await changedCameraPose(stage, beforeOrbit.revision);
  expect(distance(afterOrbit.target, beforeOrbit.target)).toBeLessThan(0.001);
  expect(
    distance(normalizedDirection(afterOrbit), normalizedDirection(beforeOrbit)),
  ).toBeGreaterThan(0.01);

  const centerX = bounds.x + bounds.width * 0.62;
  const centerY = bounds.y + bounds.height * 0.42;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: centerX - 30, y: centerY },
      { x: centerX + 30, y: centerY },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: centerX - 31, y: centerY + 18 },
      { x: centerX + 79, y: centerY + 18 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const afterPinch = await changedCameraPose(stage, afterOrbit.revision);
  expect(distance(afterPinch.position, afterPinch.target)).toBeLessThan(
    distance(afterOrbit.position, afterOrbit.target),
  );
  await expect
    .poll(async () => Number(await stage.getAttribute("data-camera-touch-focus-x")))
    .toBeCloseTo(bounds.width * 0.62 + 24, 2);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-camera-touch-focus-y")))
    .toBeCloseTo(bounds.height * 0.42 + 18, 2);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-camera-touch-focus-error")))
    .toBeLessThan(0.00001);
});

async function dispatchWheel(
  stage: Locator,
  options: {
    deltaX?: number;
    deltaY: number;
    ctrlKey?: boolean;
    focusXRatio?: number;
    focusYRatio?: number;
    repeat?: number;
    deltaYs?: number[];
  },
): Promise<void> {
  await stage.evaluate((element, input) => {
    const bounds = element.getBoundingClientRect();
    const WheelEventConstructor = element.ownerDocument.defaultView?.WheelEvent;
    if (!WheelEventConstructor) throw new Error("WheelEvent is unavailable");
    const deltaYs = input.deltaYs ?? Array.from(
      { length: input.repeat },
      () => input.deltaY,
    );
    for (const deltaY of deltaYs) {
      element.dispatchEvent(
        new WheelEventConstructor("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: input.ctrlKey,
          deltaMode: 0,
          deltaX: input.deltaX,
          deltaY,
          clientX: bounds.left + bounds.width * input.focusXRatio,
          clientY: bounds.top + bounds.height * input.focusYRatio,
        }),
      );
    }
  }, {
    deltaX: options.deltaX ?? 0,
    deltaY: options.deltaY,
    ctrlKey: options.ctrlKey ?? false,
    focusXRatio: options.focusXRatio ?? 0.5,
    focusYRatio: options.focusYRatio ?? 0.5,
    repeat: options.repeat ?? 1,
    deltaYs: options.deltaYs,
  });
}

function subtract(left: readonly number[], right: readonly number[]): number[] {
  return left.map((value, index) => value - right[index]);
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left.reduce((total, value, index) => total + value * right[index], 0);
}

function normalizedDirection(pose: CameraPoseSnapshot): number[] {
  const direction = subtract(pose.target, pose.position);
  const length = Math.hypot(...direction);
  return direction.map((value) => value / length);
}

async function waitForLoadedCamera(page: import("@playwright/test").Page, stage: Locator) {
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  await expect
    .poll(
      async () => {
        const pose = await cameraPose(stage);
        const bounds = JSON.parse((await stage.getAttribute("data-camera-bounds")) ?? "null");
        const depth = bounds?.max[2] ?? 0;
        return depth > 60
          ? Math.abs(pose.target[2] - (depth + bounds.min[2]) / 2)
          : Number.POSITIVE_INFINITY;
      },
      { timeout: 15_000 },
    )
    .toBeLessThan(0.01);
  await expect(stage).toHaveAttribute("data-camera-transitioning", "false", {
    timeout: 15_000,
  });
}

function cameraBasis(pose: CameraPoseSnapshot): {
  right: number[];
  up: number[];
} {
  const forward = normalizedDirection(pose);
  const right = normalize(cross(forward, [0, 1, 0]));
  return { right, up: normalize(cross(right, forward)) };
}

function normalize(value: readonly number[]): number[] {
  const length = Math.hypot(...value);
  return value.map((coordinate) => coordinate / length);
}

function cross(left: readonly number[], right: readonly number[]): number[] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

async function changedCameraPose(
  stage: Locator,
  previousRevision: number,
): Promise<CameraPoseSnapshot> {
  await expect
    .poll(async () => (await cameraPose(stage)).revision)
    .toBeGreaterThan(previousRevision);
  return cameraPose(stage);
}

async function cameraPose(stage: Locator): Promise<CameraPoseSnapshot> {
  const raw = await stage.getAttribute("data-camera-pose");
  if (!raw) throw new Error("Camera pose diagnostics are unavailable");
  return JSON.parse(raw) as CameraPoseSnapshot;
}

function distance(left: readonly number[], right: readonly number[]): number {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

function vectorBetween(
  position: readonly number[],
  target: readonly number[],
): [number, number, number] {
  return [0, 1, 2].map((index) =>
    Number((position[index] - target[index]).toFixed(4)),
  ) as [number, number, number];
}
