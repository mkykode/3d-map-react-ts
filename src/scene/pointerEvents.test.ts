import { expect, it } from "vitest";
import { PointerPosition } from "./pointerEvents";

it("keeps native fractional pointer release and integer click on the same geometry", () => {
  const pointer = new PointerPosition();
  pointer.resolve({ type: "pointerup", clientX: 411.1159, clientY: 281.4515 });
  expect(pointer.resolve({ type: "click", clientX: 411, clientY: 281 })).toEqual({ x: 411.1159, y: 281.4515 });
  expect(pointer.resolve({ type: "dblclick", clientX: 411, clientY: 281 })).toEqual({ x: 411.1159, y: 281.4515 });
  expect(pointer.resolve({ type: "pointermove", clientX: 411, clientY: 281 })).toEqual({ x: 411, y: 281 });
  expect(pointer.resolve({ type: "click", clientX: 900, clientY: 500 })).toEqual({ x: 900, y: 500 });
});
