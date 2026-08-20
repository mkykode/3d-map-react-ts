import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  PAN_PLANE_AXES,
  WheelGestureClassifier,
  anchorCameraAtScreenPoint,
  classifyWheelGesture,
  panCameraByPixels,
  panOffsetForPlane,
  zoomCameraAtScreenPoint,
  zoomFactorForWheel,
} from "./cameraNavigation";

describe("panOffsetForPlane", () => {
  it("maps horizontal and vertical movement onto the selected world plane", () => {
    expect(panOffsetForPlane("xy", 2, 3)).toEqual([2, 3, 0]);
    expect(panOffsetForPlane("xz", 2, 3)).toEqual([2, 0, 3]);
    expect(panOffsetForPlane("yz", 2, 3)).toEqual([0, 3, 2]);
    expect(PAN_PLANE_AXES.yz).toEqual(["z", "y"]);
  });
});

describe("classifyWheelGesture", () => {
  it("treats trackpad scroll as pan and discrete wheel or pinch input as zoom", () => {
    expect(
      classifyWheelGesture({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 18,
        deltaY: 2,
      }),
    ).toBe("pan");
    expect(
      classifyWheelGesture({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 12.5,
      }),
    ).toBe("pan");
    expect(
      classifyWheelGesture({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 100,
      }),
    ).toBe("zoom");
    expect(
      classifyWheelGesture({
        ctrlKey: true,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 4,
      }),
    ).toBe("zoom");
    expect(
      classifyWheelGesture({
        ctrlKey: false,
        deltaMode: 1,
        deltaX: 0,
        deltaY: 3,
      }),
    ).toBe("zoom");
  });

  it("converts wheel deltas to the same zoom factors as OrbitControls", () => {
    expect(zoomFactorForWheel(-100, 1)).toBeCloseTo(0.95);
    expect(zoomFactorForWheel(-4, 1)).toBeCloseTo(0.95);
    expect(zoomFactorForWheel(100, 1)).toBeCloseTo(1 / 0.95);
    expect(zoomFactorForWheel(0, 1)).toBe(1);
  });
});

describe("WheelGestureClassifier", () => {
  it("keeps rapid equal discrete wheel steps as zoom evidence", () => {
    const classifier = new WheelGestureClassifier();
    expect(
      classifier.observe({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 4,
        timeStamp: 100,
      }),
    ).toBeNull();
    expect(
      classifier.observe({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 4,
        timeStamp: 108,
      }),
    ).toEqual({ gesture: "zoom", deltaX: 0, deltaY: 4, wheelSteps: 2 });
  });

  it("uses a vertical event burst as observable trackpad pan evidence", () => {
    const classifier = new WheelGestureClassifier();
    expect(
      classifier.observe({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 80,
        timeStamp: 100,
      }),
    ).toBeNull();
    expect(
      classifier.observe({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 70,
        timeStamp: 108,
      }),
    ).toEqual({ gesture: "pan", deltaX: 0, deltaY: 150 });
    expect(
      classifier.observe({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 60,
        timeStamp: 116,
      }),
    ).toEqual({ gesture: "pan", deltaX: 0, deltaY: 60 });
  });

  it("classifies an isolated small pixel wheel event as discrete zoom on flush", () => {
    const classifier = new WheelGestureClassifier();
    expect(
      classifier.observe({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 4,
        timeStamp: 200,
      }),
    ).toBeNull();
    expect(classifier.flush()).toEqual({
      gesture: "zoom",
      deltaX: 0,
      deltaY: 4,
    });
  });

  it("retains non-enumerable browser WheelEvent fields while deferring", () => {
    const browserEvent = {} as {
      ctrlKey: boolean;
      deltaMode: number;
      deltaX: number;
      deltaY: number;
      timeStamp: number;
    };
    Object.defineProperties(browserEvent, {
      ctrlKey: { value: false },
      deltaMode: { value: 0 },
      deltaX: { value: 0 },
      deltaY: { value: 7 },
      timeStamp: { value: 300 },
    });
    const classifier = new WheelGestureClassifier();

    classifier.observe(browserEvent);

    expect(classifier.flush()).toEqual({
      gesture: "zoom",
      deltaX: 0,
      deltaY: 7,
    });
  });
});

describe("panCameraByPixels", () => {
  it("pans a perspective camera and target without changing their distance", () => {
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
    const target = new THREE.Vector3(0, 0, 0);
    camera.position.set(0, 0, 10);
    camera.lookAt(target);
    camera.updateMatrix();

    panCameraByPixels(camera, target, 100, 100, 10, 10);

    expect(camera.position.x).toBeCloseTo(-2);
    expect(camera.position.y).toBeCloseTo(2);
    expect(target.x).toBeCloseTo(-2);
    expect(target.y).toBeCloseTo(2);
    expect(camera.position.distanceTo(target)).toBeCloseTo(10);
  });

  it("pans an orthographic camera without changing zoom", () => {
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    const target = new THREE.Vector3(0, 0, 0);
    camera.position.set(0, 0, 10);
    camera.zoom = 2;
    camera.lookAt(target);
    camera.updateMatrix();

    panCameraByPixels(camera, target, 100, 100, 20, 20);

    expect(camera.position.x).toBeCloseTo(-1);
    expect(camera.position.y).toBeCloseTo(1);
    expect(target.x).toBeCloseTo(-1);
    expect(target.y).toBeCloseTo(1);
    expect(camera.zoom).toBe(2);
  });
});

describe("zoomCameraAtScreenPoint", () => {
  it.each([
    ["perspective", new THREE.PerspectiveCamera(60, 2, 0.1, 1_000)],
    [
      "orthographic",
      new THREE.OrthographicCamera(-10, 10, 5, -5, 0.1, 1_000),
    ],
  ] as const)(
    "keeps an off-center world point fixed for a %s camera",
    (_, camera) => {
      const target = new THREE.Vector3(0, 0, 0);
      camera.position.set(0, 0, 20);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      const anchor = zoomCameraAtScreenPoint(
        camera,
        target,
        200,
        100,
        150,
        25,
        0.8,
      );

      const projected = anchor.clone().project(camera);
      expect(projected.x).toBeCloseTo(0.5, 6);
      expect(projected.y).toBeCloseTo(0.5, 6);
    },
  );

  it("does not introduce lateral movement when zooming at the center", () => {
    const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1_000);
    const target = new THREE.Vector3(3, 4, 0);
    camera.position.set(3, 4, 20);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);

    zoomCameraAtScreenPoint(camera, target, 200, 100, 100, 50, 0.8);

    expect(target.x).toBeCloseTo(3);
    expect(target.y).toBeCloseTo(4);
    expect(camera.position.x).toBeCloseTo(3);
    expect(camera.position.y).toBeCloseTo(4);
  });
});

describe("anchorCameraAtScreenPoint", () => {
  it("corrects a completed touch zoom back to its original focus", () => {
    const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1_000);
    const target = new THREE.Vector3(0, 0, 0);
    camera.position.set(0, 0, 20);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    const anchor = new THREE.Vector3(5.7735026919, 2.8867513459, 0);
    camera.position.lerpVectors(target, camera.position, 0.7);
    camera.updateMatrixWorld(true);

    anchorCameraAtScreenPoint(camera, target, anchor, 200, 100, 150, 25);

    const projected = anchor.clone().project(camera);
    expect(projected.x).toBeCloseTo(0.5, 6);
    expect(projected.y).toBeCloseTo(0.5, 6);
  });
});
