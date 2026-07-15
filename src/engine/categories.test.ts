import { describe, expect, it } from "vitest";
import { CATEGORIES, CAT_ID, classifyEvent } from "./categories";

describe("classifyEvent", () => {
  it("maps DevTools timeline names to their panel categories", () => {
    expect(classifyEvent("ParseHTML", "devtools.timeline")).toBe(CAT_ID.loading);
    expect(classifyEvent("FunctionCall", "devtools.timeline")).toBe(
      CAT_ID.scripting,
    );
    expect(classifyEvent("ProfileCall", "")).toBe(CAT_ID.scripting);
    expect(classifyEvent("Layout", "devtools.timeline")).toBe(CAT_ID.rendering);
    expect(classifyEvent("Paint", "devtools.timeline")).toBe(CAT_ID.painting);
    expect(classifyEvent("GPUTask", "gpu")).toBe(CAT_ID.gpu);
    expect(classifyEvent("RunTask", "devtools.timeline")).toBe(CAT_ID.system);
  });

  it("falls back by category substring, then system", () => {
    expect(classifyEvent("SomeV8Thing", "v8.execute")).toBe(CAT_ID.scripting);
    expect(classifyEvent("mark", "blink.user_timing")).toBe(CAT_ID.other);
    expect(classifyEvent("UnknownEvent", "whatever")).toBe(CAT_ID.system);
  });

  it("category ids all fit the palette", () => {
    expect(Math.max(...Object.values(CAT_ID))).toBe(CATEGORIES.length - 1);
  });
});
