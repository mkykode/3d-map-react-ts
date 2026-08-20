import { useAppStore } from "../state/store";
import {
  cameraOrientationLabel,
  type SerializableCameraPose,
  type Vector3Tuple,
} from "./cameraActions";
import { TIME_W } from "./layout";

export function Minimap({ worldDepth }: { worldDepth: number }) {
  const pose = useAppStore((state) => state.cameraPose);
  const visiblePose: SerializableCameraPose = pose ?? {
    target: [TIME_W / 2, 0, worldDepth / 2],
    position: [TIME_W * 0.62, 80, worldDepth + TIME_W * 0.42],
    zoom: 1,
    projection: "perspective",
    preset: "orbit",
    mode: "strategy",
  };
  const { target, position } = visiblePose;
  const point = minimapPoint(target, worldDepth);
  const direction = minimapDirection(position, target);

  return (
    <svg
      className="camera-minimap"
      viewBox="0 0 100 60"
      role="img"
      aria-label={cameraOrientationLabel(visiblePose)}
    >
      <rect x="2" y="2" width="96" height="56" rx="5" />
      <path d="M8 30H92M50 8V52" />
      <line
        x1={point[0]}
        y1={point[1]}
        x2={point[0] + direction[0] * 12}
        y2={point[1] + direction[1] * 12}
      />
      <circle cx={point[0]} cy={point[1]} r="3.5" />
      <text x="7" y="12">orientation</text>
    </svg>
  );
}

function minimapPoint(
  target: Vector3Tuple,
  worldDepth: number,
): readonly [number, number] {
  return [
    6 + clamp(target[0] / TIME_W) * 88,
    6 + clamp(target[2] / Math.max(1, worldDepth)) * 48,
  ];
}

function minimapDirection(
  position: Vector3Tuple,
  target: Vector3Tuple,
): readonly [number, number] {
  const x = position[0] - target[0];
  const y = position[2] - target[2];
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
