import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { ParsedTraceModel } from "../engine/types";
import { BOX_H, LANE_GAP } from "./layout";
import { findingId } from "../domain/analysis";
import {
  MAX_CAMERA_DISTANCE,
  CAMERA_ARIA_KEYSHORTCUTS,
  CAMERA_MODES,
  CAMERA_PRESETS,
  cameraInputForKeyboard,
  cameraOrientationLabel,
  resolveCameraAction,
  traceSelectionBounds,
  type WorldBounds,
} from "./cameraActions";

const workspace: WorldBounds = {
  min: [0, 0, 0],
  max: [160, 24, 84],
};

describe("resolveCameraAction", () => {
  it.each(["fit-all", "fit-selection", "reset"] as const)(
    "%s preserves selected evidence and returns a stable bounded pose",
    (kind) => {
      const selectedFindingId = findingId("finding:v1:checkout-work");
      const result = resolveCameraAction(kind, {
        workspace,
        selection: {
          min: [72, 2, 28],
          max: [88, 14, 36],
        },
        preset: "orbit",
        cameraMode: "strategy",
        viewport: { width: 1280, height: 720 },
        selectedFindingId,
      });

      expect(result.selectedFindingId).toBe(selectedFindingId);
      expect(result.pose.position.every(Number.isFinite)).toBe(true);
      expect(result.pose.target.every(Number.isFinite)).toBe(true);
      expect(distance(result.pose.position, result.pose.target)).toBeLessThanOrEqual(
        MAX_CAMERA_DISTANCE,
      );
      expect(result.pose.target[0]).toBeGreaterThanOrEqual(workspace.min[0]);
      expect(result.pose.target[0]).toBeLessThanOrEqual(workspace.max[0]);
      expect(result.pose.target[2]).toBeGreaterThanOrEqual(workspace.min[2]);
      expect(result.pose.target[2]).toBeLessThanOrEqual(workspace.max[2]);
      expect(result.pose.zoom).toBeGreaterThan(0);
    },
  );

  it.each([
    { width: 375, height: 667 },
    { width: 1440, height: 720 },
  ])("fits every perspective bound corner in a $width x $height viewport", (viewport) => {
    const result = resolveCameraAction("fit-all", {
      workspace,
      selection: null,
      preset: "orbit",
      cameraMode: "strategy",
      viewport,
      selectedFindingId: null,
    });
    const camera = new THREE.PerspectiveCamera(
      50,
      viewport.width / viewport.height,
      0.1,
      2_000,
    );
    camera.position.set(...result.pose.position);
    camera.lookAt(new THREE.Vector3(...result.pose.target));
    camera.updateMatrixWorld(true);

    for (const corner of boundsCorners(workspace)) {
      const projected = new THREE.Vector3(...corner).project(camera);
      expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.9);
      expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.9);
    }
  });
});

describe("camera input descriptors", () => {
  it("provides canonical presets, modes, shortcuts, and typed key commands", () => {
    expect(CAMERA_PRESETS).toEqual(["orbit", "top", "side"]);
    expect(CAMERA_MODES).toEqual(["strategy", "free"]);
    expect(CAMERA_ARIA_KEYSHORTCUTS).toContain("Shift+Home");
    expect(
      cameraInputForKeyboard({ key: "ArrowLeft", shiftKey: true }),
    ).toEqual({ kind: "pan", horizontal: -1, vertical: 0, multiplier: 4 });
    expect(cameraInputForKeyboard({ key: "w" })).toEqual({
      kind: "zoom",
      factor: 0.85,
    });
    expect(cameraInputForKeyboard({ key: "Home", shiftKey: true })).toEqual({
      kind: "action",
      action: "fit-selection",
    });
  });

  it("ignores modified and editable-target keyboard input", () => {
    expect(cameraInputForKeyboard({ key: "w", ctrlKey: true })).toBeNull();
    expect(
      cameraInputForKeyboard({ key: "w", target: { tagName: "INPUT" } }),
    ).toBeNull();
    expect(
      cameraInputForKeyboard({
        key: "w",
        target: { isContentEditable: true },
      }),
    ).toBeNull();
  });
});

describe("traceSelectionBounds", () => {
  it("uses the shared time and lane layout for a visible selected entry", () => {
    const model = {
      rangeMs: 100,
      lanes: [
        { meta: { id: 4 }, starts: new Float64Array([0]), durs: new Float64Array([1]), depths: new Uint16Array([0]), nameIds: new Uint32Array([1]) },
        { meta: { id: 9 }, starts: new Float64Array([50]), durs: new Float64Array([10]), depths: new Uint16Array([2]), nameIds: new Uint32Array([2]) },
      ],
    } as unknown as ParsedTraceModel;

    expect(
      traceSelectionBounds(
        model,
        { kind: "entry", lane: 9, idx: 0 },
        new Set(),
      ),
    ).toEqual({
      min: [80, 2 * BOX_H, LANE_GAP - 2.5],
      max: [96, 3 * BOX_H, LANE_GAP + 2.5],
    });
  });
});

describe("cameraOrientationLabel", () => {
  it("names camera position, target, and viewing bearing", () => {
    expect(
      cameraOrientationLabel({
        position: [100, 40, 50],
        target: [80, 0, 50],
        zoom: 1,
        projection: "perspective",
        preset: "orbit",
        mode: "strategy",
      }),
    ).toBe(
      "Camera orientation. Position 100.0, 40.0, 50.0. Target 80.0, 0.0, 50.0. Bearing 270 degrees west.",
    );
  });
});

function distance(left: readonly number[], right: readonly number[]): number {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

function boundsCorners(bounds: WorldBounds): [number, number, number][] {
  return [bounds.min[0], bounds.max[0]].flatMap((x) =>
    [bounds.min[1], bounds.max[1]].flatMap((y) =>
      [bounds.min[2], bounds.max[2]].map((z) => [x, y, z] as [number, number, number]),
    ),
  );
}
