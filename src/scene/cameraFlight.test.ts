import { describe, expect, it } from "vitest";
import { cameraLandingOutcome } from "./cameraFlight";

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
