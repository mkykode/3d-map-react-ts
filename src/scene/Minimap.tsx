import { useAppStore } from "../state/store";
import {
  cameraOrientationLabel,
  type SerializableCameraPose,
  type Vector3Tuple,
} from "./cameraActions";
import { TIME_W } from "./layout";
import { useSceneViewport } from "./viewportState";

export function Minimap({ worldDepth }: { worldDepth: number }) {
  const pose = useAppStore((state) => state.cameraPose);
  const viewport = useSceneViewport();
  const visiblePose: SerializableCameraPose = pose ?? {
    target: [TIME_W / 2, 0, worldDepth / 2],
    position: [TIME_W * 0.62, 80, worldDepth + TIME_W * 0.42],
    zoom: 1,
    projection: "perspective",
    preset: "orbit",
    mode: "strategy",
  };
  const target = viewport.target ?? visiblePose.target;
  const position = viewport.position ?? visiblePose.position;
  const bounds = viewport.bounds;
  const axis = viewport.side ? 1 : 2;
  const point: readonly [number, number] = bounds ? [
    6 + clamp((target[0] - bounds.min[0]) / Math.max(1, bounds.max[0] - bounds.min[0])) * 88,
    6 + clamp((target[axis] - bounds.min[axis]) / Math.max(1, bounds.max[axis] - bounds.min[axis])) * 48,
  ] : [50, 30];
  const direction = minimapDirection(position, target, axis);
  const footprint = bounds ? viewport.footprint.map((p) => `${6 + (p[0] - bounds.min[0]) / Math.max(1, bounds.max[0] - bounds.min[0]) * 88},${6 + (p[axis] - bounds.min[axis]) / Math.max(1, bounds.max[axis] - bounds.min[axis]) * 48}`).join(" ") : "";

  return (
    <svg
      className="camera-minimap"
      viewBox="0 0 100 60"
      role="img"
      aria-label={cameraOrientationLabel({ ...visiblePose, target, position })}
    >
      <rect x="2" y="2" width="96" height="56" rx="5" />
      <path d="M8 30H92M50 8V52" />
      {footprint && <polygon points={footprint} className="camera-footprint" />}
      <line
        x1={point[0]}
        y1={point[1]}
        x2={point[0] + direction[0] * 12}
        y2={point[1] + direction[1] * 12}
      />
      <circle cx={point[0]} cy={point[1]} r="3.5" />
      <text x="7" y="12">{viewport.side ? "side coverage" : "visible area"}</text>
    </svg>
  );
}

function minimapDirection(
  position: Vector3Tuple,
  target: Vector3Tuple,
  axis: number,
): readonly [number, number] {
  const x = position[0] - target[0];
  const y = position[axis] - target[axis];
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
