import type { CameraPreset, ScaleMode, ViewId } from "../state/store";
import { useAppStore, VIEW_IDS } from "../state/store";
import { CAMERA_PRESETS } from "../scene/cameraActions";

const SCALES: ScaleMode[] = ["linear", "log"];

/**
 * Shareable state in the URL hash:
 *   #view=terrain&preset=top&scale=log&brush=120.5-480
 */
let initialized = false;

export function initUrlState(): void {
  // StrictMode/HMR call this more than once; listeners register only once.
  if (initialized) return;
  initialized = true;

  applyHash();
  // Writes below use replaceState (no hashchange), so this only reacts to
  // user-edited URLs.
  window.addEventListener("hashchange", applyHash);

  let scheduled = false;
  useAppStore.subscribe(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      // Read the store fresh: several changes can land within one frame.
      const state = useAppStore.getState();
      const p = new URLSearchParams();
      p.set("view", state.view);
      p.set("preset", state.preset);
      p.set("scale", state.scale);
      if (state.brush) {
        p.set(
          "brush",
          `${state.brush[0].toFixed(1)}-${state.brush[1].toFixed(1)}`,
        );
      }
      if (state.playhead !== null) p.set("t", String(state.playhead));
      history.replaceState(null, "", `#${p.toString()}`);
    });
  });
}

function applyHash(): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const view = params.get("view") as ViewId | null;
  const preset = params.get("preset") as CameraPreset | null;
  const scale = params.get("scale") as ScaleMode | null;
  const brushRaw = params.get("brush");
  const timeRaw = params.get("t");

  const patch: Partial<ReturnType<typeof useAppStore.getState>> = { brush: null, playhead: null, playing: false };
  patch.view = view && VIEW_IDS.includes(view) ? view : VIEW_IDS[0];
  if (preset && CAMERA_PRESETS.includes(preset)) patch.preset = preset;
  if (scale && SCALES.includes(scale)) patch.scale = scale;
  if (brushRaw) {
    const [a, b] = brushRaw.split("-").map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      patch.brush = [a, b];
    }
  }
  if (Object.keys(patch).length > 0) useAppStore.setState(patch);
  if (timeRaw !== null && timeRaw.trim() !== "" && Number.isFinite(Number(timeRaw))) useAppStore.getState().setPlayhead(Number(timeRaw));
}
