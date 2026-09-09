import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { cameraLandingOutcome, perspectiveLanding } from "./cameraFlight";
import { MAX_FLIGHT_FOV } from "./cameraLimits";

describe("cameraLandingOutcome", () => {
  it("settles an action already using the requested orthographic camera", () => {
    expect(cameraLandingOutcome("top", "top")).toBe("settled");
    expect(cameraLandingOutcome("side", "side")).toBe("settled");
  });

  it("requests a camera swap only when the orthographic preset changed", () => {
    expect(cameraLandingOutcome("top", null)).toBe("swap");
    expect(cameraLandingOutcome("side", "top")).toBe("swap");
    expect(cameraLandingOutcome("orbit", null)).toBe("settled");
  });
});

describe("perspectiveLanding", () => {
  it.each([0.25, 0.62, 2, 250])("matches orthographic scale with bounded FOV at zoom %s", (zoom) => {
    const next = { position: new Vector3(80, 348, 140), target: new Vector3(80, 340, 0), zoom };
    const landing = perspectiveLanding(next, 720);
    expect(landing.fov).toBeLessThanOrEqual(MAX_FLIGHT_FOV);
    expect(landing.fov).toBeGreaterThan(0);
    const height = 2 * landing.position.distanceTo(next.target) * Math.tan(landing.fov * Math.PI / 360);
    expect(height).toBeCloseTo(720 / zoom, 8);
    expect(landing.position.clone().sub(next.target).normalize().distanceTo(next.position.clone().sub(next.target).normalize())).toBeLessThan(1e-10);
    expect(next.position.toArray()).toEqual([80, 348, 140]);
  });
});
