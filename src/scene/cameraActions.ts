import type { FindingId } from "../domain/analysis";
import type { ParsedTraceModel } from "../engine/types";
import { eventBounds, traceLayout } from "./traceLayout";
import { CAMERA_FOV, clampCameraZoom } from "./cameraLimits";

export const CAMERA_PRESETS = ["orbit", "top", "side"] as const;
export const CAMERA_MODES = ["strategy", "free"] as const;
export type Vector3Tuple = readonly [x: number, y: number, z: number];
export type CameraActionPreset = (typeof CAMERA_PRESETS)[number];
export type CameraControlMode = (typeof CAMERA_MODES)[number];
export type CameraActionKind = "fit-all" | "fit-selection" | "reset";
export type TraceSelection =
  | { kind: "entry"; lane: number; idx: number }
  | { kind: "name"; nameId: number };
export type CameraInputCommand =
  | {
      kind: "pan";
      horizontal: number;
      vertical: number;
      multiplier: number;
    }
  | { kind: "zoom"; factor: number }
  | { kind: "rotate"; axis: "yaw" | "pitch"; angle: number }
  | { kind: "action"; action: CameraActionKind };

export interface CameraControlDescriptor {
  id: string;
  label: string;
  symbol: string;
  key: string;
  orbitOnly?: boolean;
  command: CameraInputCommand;
}

export const CAMERA_CONTROL_DESCRIPTORS: readonly CameraControlDescriptor[] = [
  {
    id: "pan-left",
    label: "Pan left",
    symbol: "←",
    key: "ArrowLeft",
    command: { kind: "pan", horizontal: -1, vertical: 0, multiplier: 1 },
  },
  {
    id: "pan-up",
    label: "Pan up",
    symbol: "↑",
    key: "ArrowUp",
    command: { kind: "pan", horizontal: 0, vertical: 1, multiplier: 1 },
  },
  {
    id: "pan-down",
    label: "Pan down",
    symbol: "↓",
    key: "ArrowDown",
    command: { kind: "pan", horizontal: 0, vertical: -1, multiplier: 1 },
  },
  {
    id: "pan-right",
    label: "Pan right",
    symbol: "→",
    key: "ArrowRight",
    command: { kind: "pan", horizontal: 1, vertical: 0, multiplier: 1 },
  },
  {
    id: "zoom-out",
    label: "Zoom out",
    symbol: "−",
    key: "s",
    command: { kind: "zoom", factor: 1 / 0.85 },
  },
  {
    id: "zoom-in",
    label: "Zoom in",
    symbol: "+",
    key: "w",
    command: { kind: "zoom", factor: 0.85 },
  },
  {
    id: "turn-left",
    label: "Turn left",
    symbol: "Turn left",
    key: "q",
    orbitOnly: true,
    command: { kind: "rotate", axis: "yaw", angle: 0.12 },
  },
  {
    id: "turn-right",
    label: "Turn right",
    symbol: "Turn right",
    key: "e",
    orbitOnly: true,
    command: { kind: "rotate", axis: "yaw", angle: -0.12 },
  },
  {
    id: "tilt-up",
    label: "Tilt up",
    symbol: "Tilt up",
    key: "r",
    orbitOnly: true,
    command: { kind: "rotate", axis: "pitch", angle: -0.12 },
  },
  {
    id: "tilt-down",
    label: "Tilt down",
    symbol: "Tilt down",
    key: "f",
    orbitOnly: true,
    command: { kind: "rotate", axis: "pitch", angle: 0.12 },
  },
];

export const CAMERA_ARIA_KEYSHORTCUTS = [
  ...CAMERA_CONTROL_DESCRIPTORS.map((control) => control.key),
  "a",
  "d",
  "Home",
  "Shift+Home",
  "0",
].join(" ");

export function isEditableKeyboardTarget(
  target: { tagName?: string; isContentEditable?: boolean } | null,
): boolean {
  return Boolean(
    target?.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(
        target?.tagName?.toUpperCase() ?? "",
      ),
  );
}

export function cameraInputForKeyboard(input: {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}): CameraInputCommand | null {
  if (
    input.metaKey ||
    input.ctrlKey ||
    isEditableKeyboardTarget(input.target ?? null)
  ) {
    return null;
  }
  const key = input.key.toLowerCase();
  if (key === "home") {
    return {
      kind: "action",
      action: input.shiftKey ? "fit-selection" : "fit-all",
    };
  }
  if (key === "0") return { kind: "action", action: "reset" };
  const multiplier = input.shiftKey ? 4 : input.altKey ? 0.25 : 1;
  if (key === "a") {
    return { kind: "pan", horizontal: -1, vertical: 0, multiplier };
  }
  if (key === "d") {
    return { kind: "pan", horizontal: 1, vertical: 0, multiplier };
  }
  const descriptor = CAMERA_CONTROL_DESCRIPTORS.find(
    (control) => control.key.toLowerCase() === key,
  );
  if (!descriptor) return null;
  return descriptor.command.kind === "pan"
    ? { ...descriptor.command, multiplier }
    : descriptor.command;
}

export interface WorldBounds {
  min: Vector3Tuple;
  max: Vector3Tuple;
}

export interface SerializableCameraPose {
  position: Vector3Tuple;
  target: Vector3Tuple;
  zoom: number;
  projection: "perspective" | "orthographic";
  preset: CameraActionPreset;
  mode: CameraControlMode;
}

export const MAX_CAMERA_DISTANCE = 600;

export function cameraOrientationLabel(pose: SerializableCameraPose): string {
  const dx = pose.target[0] - pose.position[0];
  const dz = pose.target[2] - pose.position[2];
  const bearing = (THREE_HUNDRED_SIXTY + (Math.atan2(dx, dz) * 180) / Math.PI) %
    THREE_HUNDRED_SIXTY;
  return `Camera orientation. Position ${formatVector(pose.position)}. Target ${formatVector(pose.target)}. Bearing ${Math.round(bearing)} degrees ${bearingName(bearing)}.`;
}

const THREE_HUNDRED_SIXTY = 360;

function formatVector(value: Vector3Tuple): string {
  return value.map((coordinate) => coordinate.toFixed(1)).join(", ");
}

function bearingName(bearing: number): string {
  const names = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  return names[Math.round(bearing / 45) % names.length];
}

export function traceSelectionBounds(
  model: ParsedTraceModel,
  selection: TraceSelection | null,
  hiddenLanes: Set<number>,
  preset: CameraActionPreset = "orbit",
  window: readonly [number, number] = [0, model.rangeMs],
): WorldBounds | null {
  if (!selection) return null;
  const visibleLanes = model.lanes.filter(
    (lane) => !hiddenLanes.has(lane.meta.id),
  );
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const placement of traceLayout(visibleLanes, preset).placements) {
    const lane = placement.lane;
    if (selection.kind === "entry" && selection.lane !== lane.meta.id) continue;
    const startIndex = selection.kind === "entry" ? selection.idx : 0;
    const endIndex = selection.kind === "entry" ? selection.idx + 1 : lane.starts.length;
    for (let index = startIndex; index < endIndex; index += 1) {
      const selected =
        selection.kind === "entry"
          ? lane.meta.id === selection.lane && index === selection.idx
          : lane.nameIds[index] === selection.nameId;
      if (!selected) continue;
      const b = eventBounds(placement, index, window[0], window[1]);
      if (!b) continue;
      minX = Math.min(minX, b.min[0]); maxX = Math.max(maxX, b.max[0]);
      minY = Math.min(minY, b.min[1]); maxY = Math.max(maxY, b.max[1]);
      minZ = Math.min(minZ, b.min[2]); maxZ = Math.max(maxZ, b.max[2]);
    }
  }

  return Number.isFinite(minX)
    ? { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }
    : null;
}

export function resolveCameraAction(
  kind: CameraActionKind,
  context: {
    workspace: WorldBounds;
    selection: WorldBounds | null;
    preset: CameraActionPreset;
    cameraMode: CameraControlMode;
    viewport: { width: number; height: number };
    selectedFindingId: FindingId | null;
  },
): { pose: SerializableCameraPose; selectedFindingId: FindingId | null } {
  const bounds =
    kind === "fit-selection" && context.selection
      ? context.selection
      : context.workspace;
  return {
    pose: poseForBounds(
      bounds,
      context.preset,
      context.viewport,
      context.cameraMode,
    ),
    selectedFindingId: context.selectedFindingId,
  };
}

export function poseForBounds(
  bounds: WorldBounds,
  preset: CameraActionPreset,
  viewport: { width: number; height: number },
  mode: CameraControlMode,
): SerializableCameraPose {
  const target = midpoint(bounds);
  const width = Math.max(1, bounds.max[0] - bounds.min[0]);
  const height = Math.max(1, bounds.max[1] - bounds.min[1]);
  const depth = Math.max(1, bounds.max[2] - bounds.min[2]);
  const viewportWidth = Math.max(1, viewport.width);
  const viewportHeight = Math.max(1, viewport.height);

  if (preset === "top") {
    return {
      position: [target[0], Math.min(MAX_CAMERA_DISTANCE, target[1] + 130), target[2]],
      target,
      zoom: clampCameraZoom(
        Math.min(
          (viewportWidth * 0.82) / (width + 20),
          (viewportHeight * 0.82) / (depth + 14),
        ),
      ),
      projection: "orthographic",
      preset,
      mode,
    };
  }

  if (preset === "side") {
    return {
      position: [
        target[0],
        target[1] + 8,
        target[2] + Math.min(MAX_CAMERA_DISTANCE, 140),
      ],
      target,
      zoom: clampCameraZoom(
        Math.min(
          (viewportWidth * 0.82) / (width + 20),
          (viewportHeight * 0.72) / (height + 12),
        ),
      ),
      projection: "orthographic",
      preset,
      mode,
    };
  }

  const aspect = viewportWidth / viewportHeight;
  const tanY = Math.tan((CAMERA_FOV * Math.PI) / 360);
  const tanX = tanY * aspect;
  const direction = normalize([0.18, 0.62, 0.76]);
  const forward = scale(direction, -1);
  const right = normalize(cross(forward, [0, 1, 0]));
  const cameraUp = normalize(cross(right, forward));
  const fitFraction = 0.82;
  let requiredDistance = 24;
  for (const corner of boundsCorners(bounds)) {
    const relative = subtract(corner, target);
    requiredDistance = Math.max(
      requiredDistance,
      dot(relative, direction) +
        Math.max(
          Math.abs(dot(relative, right)) / (tanX * fitFraction),
          Math.abs(dot(relative, cameraUp)) / (tanY * fitFraction),
        ),
    );
  }
  const distance = Math.min(
    MAX_CAMERA_DISTANCE,
    requiredDistance,
  );
  return {
    position: [
      target[0] + direction[0] * distance,
      target[1] + direction[1] * distance,
      target[2] + direction[2] * distance,
    ],
    target,
    zoom: 1,
    projection: "perspective",
    preset,
    mode,
  };
}

function midpoint(bounds: WorldBounds): Vector3Tuple {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

function normalize(value: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(...value);
  return [value[0] / length, value[1] / length, value[2] / length];
}

function boundsCorners(bounds: WorldBounds): Vector3Tuple[] {
  return [bounds.min[0], bounds.max[0]].flatMap((x) =>
    [bounds.min[1], bounds.max[1]].flatMap((y) =>
      [bounds.min[2], bounds.max[2]].map((z) => [x, y, z] as const),
    ),
  );
}

function dot(left: Vector3Tuple, right: Vector3Tuple): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Vector3Tuple, right: Vector3Tuple): Vector3Tuple {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function subtract(left: Vector3Tuple, right: Vector3Tuple): Vector3Tuple {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(value: Vector3Tuple, factor: number): Vector3Tuple {
  return [value[0] * factor, value[1] * factor, value[2] * factor];
}
