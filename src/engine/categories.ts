/**
 * Event categorization and the validated color system.
 *
 * Category semantics mirror Chrome DevTools' Performance panel (loading,
 * scripting, rendering, painting, system) so existing knowledge transfers.
 * The chromatic hues are the dataviz-skill reference dark palette in its
 * CVD-validated slot order (worst adjacent dE 10.3, floor band; the legend,
 * inter-box gaps, and lane separation supply the required secondary encoding).
 * `system` is a deliberately de-emphasized neutral outside the chromatic set.
 */

export const CATEGORIES = [
  { key: "loading", label: "Loading", color: "#3987e5" },
  { key: "gpu", label: "GPU", color: "#199e70" },
  { key: "scripting", label: "Scripting", color: "#c98500" },
  { key: "painting", label: "Painting", color: "#008300" },
  { key: "rendering", label: "Rendering", color: "#9085e9" },
  { key: "other", label: "Other", color: "#d55181" },
  { key: "system", label: "System", color: "#5c6470" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export const CAT_ID: Record<CategoryKey, number> = Object.fromEntries(
  CATEGORIES.map((c, i) => [c.key, i]),
) as Record<CategoryKey, number>;

/** Sequential blue ramp (dark surface: brighter = busier). */
export const SEQUENTIAL_RAMP = [
  "#184f95",
  "#1c5cab",
  "#256abf",
  "#2a78d6",
  "#3987e5",
  "#5598e7",
  "#6da7ec",
  "#86b6ef",
];

/** Diverging pair for trace diffs: regression warm, improvement cool. */
export const DIVERGING = {
  regression: "#e66767",
  neutral: "#8a8a85",
  improvement: "#3987e5",
};

/** Reserved status color (dropped frames); never used as a series hue. */
export const STATUS_SERIOUS = "#e34948";

const NAME_TO_CAT: Record<string, CategoryKey> = {};

function register(cat: CategoryKey, names: string[]): void {
  for (const n of names) NAME_TO_CAT[n] = cat;
}

register("loading", [
  "ParseHTML",
  "ParseAuthorStyleSheet",
  "ResourceSendRequest",
  "ResourceReceiveResponse",
  "ResourceReceivedData",
  "ResourceReceiveData",
  "ResourceFinish",
  "XHRReadyStateChange",
  "XHRLoad",
  "CommitLoad",
  "SyntheticNetworkRequest",
]);

register("scripting", [
  "ProfileCall",
  "FunctionCall",
  "EvaluateScript",
  "EvaluateModule",
  "EventDispatch",
  "TimerFire",
  "TimerInstall",
  "TimerRemove",
  "RunMicrotasks",
  "FireAnimationFrame",
  "RequestAnimationFrame",
  "CancelAnimationFrame",
  "FireIdleCallback",
  "RequestIdleCallback",
  "WebSocketCreate",
  "WebSocketSendHandshakeRequest",
  "WebSocketReceiveHandshakeResponse",
  "WebSocketDestroy",
  "MinorGC",
  "MajorGC",
  "BlinkGC.AtomicPhase",
  "V8.GCFinalizeMC",
  "GCEvent",
  "v8.callFunction",
  "v8.run",
  "v8.compile",
  "v8.evaluateModule",
  "V8Console::runTask",
]);

register("rendering", [
  "ScheduleStyleRecalculation",
  "RecalculateStyles",
  "UpdateLayoutTree",
  "Layout",
  "InvalidateLayout",
  "LayoutShift",
  "HitTest",
  "PrePaint",
  "UpdateLayerTree",
  "Layerize",
  "ComputeIntersections",
]);

register("painting", [
  "Paint",
  "PaintImage",
  "RasterTask",
  "Rasterize",
  "CompositeLayers",
  "Commit",
  "Decode Image",
  "DecodeImage",
  "ImageDecodeTask",
  "DrawFrame",
  "BeginFrame",
  "ActivateLayerTree",
]);

register("gpu", ["GPUTask"]);

/**
 * Classify an event into a category id. Name mapping first, then category
 * substrings, then system (the DevTools default for uncolored internals).
 */
export function classifyEvent(name: string, cat: string): number {
  const byName = NAME_TO_CAT[name];
  if (byName) return CAT_ID[byName];

  if (name.startsWith("V8.") || name.startsWith("v8.")) {
    return CAT_ID.scripting;
  }
  if (cat.includes("blink.user_timing") || cat.includes("blink.console")) {
    return CAT_ID.other;
  }
  if (cat.includes("v8") || cat.includes("cpu_profiler")) {
    return CAT_ID.scripting;
  }
  if (cat.includes("loading")) return CAT_ID.loading;
  if (cat.includes("gpu")) return CAT_ID.gpu;
  return CAT_ID.system;
}
