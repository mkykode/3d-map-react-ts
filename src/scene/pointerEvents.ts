import { events, type EventManager } from "@react-three/fiber";

export class PointerPosition {
  private released: { x: number; y: number } | null = null;
  resolve(event: { type: string; clientX: number; clientY: number }) {
    const point = { x: event.clientX, y: event.clientY };
    if (event.type === "pointerup") this.released = point;
    // Mouse click coordinates are integer-rounded, unlike PointerEvent coordinates.
    if ((event.type === "click" || event.type === "dblclick") && this.released && Math.hypot(point.x - this.released.x, point.y - this.released.y) < 1.5) return this.released;
    return point;
  }
}

/** Retargeting/pointer capture must not change the canvas coordinate system. */
export function scenePointerEvents(store: Parameters<typeof events>[0]): EventManager<HTMLElement> {
  const position = new PointerPosition();
  return {
    ...events(store),
    compute(event, state) {
      const point = position.resolve(event as PointerEvent);
      const rect = state.gl.domElement.getBoundingClientRect();
      state.pointer.set((point.x - rect.left) / rect.width * 2 - 1, 1 - (point.y - rect.top) / rect.height * 2);
      state.raycaster.setFromCamera(state.pointer, state.camera);
    },
  };
}
