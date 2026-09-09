import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ParsedTraceModel } from "../engine/types";
import { computeStalls } from "../engine/aggregate";
import { DIVERGING } from "../engine/categories";
import { TIME_W } from "./layout";
import { ScreenLabel } from "./ScreenLabels";
import { SegmentLines } from "./SegmentLines";
import { uploadInstances, writeBox } from "./instanceBuffers";
import type { Vector3Tuple } from "./cameraActions";

export function StallBands({ model, t0, t1, depth, height }: { model: ParsedTraceModel; t0: number; t1: number; depth: number; height: number }) {
  const bands = useMemo(() => computeStalls(model.lanes.find((l) => l.meta.kind === "main"), model.requests, t0, t1), [model, t0, t1]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const spans = useMemo(() => bands.map((band) => ({ x: (band.start - t0) / (t1 - t0) * TIME_W, w: (band.end - band.start) / (t1 - t0) * TIME_W })), [bands, t0, t1]);
  const lines = useMemo<Vector3Tuple[]>(() => spans.flatMap((span) => [
    [span.x, 0.18, -3], [span.x, 0.18, depth],
    [span.x + span.w, 0.18, -3], [span.x + span.w, 0.18, depth],
  ] as Vector3Tuple[]), [spans, depth]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    spans.forEach((span, i) => writeBox(mesh, i, span.x + span.w / 2, -0.02, (depth - 3) / 2, span.w, 0.04, depth + 3));
    uploadInstances(mesh, spans.length, { min: [0, -0.04, -3], max: [TIME_W, 0, depth] });
  }, [spans, depth]);
  return <group>
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, spans.length)]} count={spans.length} raycast={() => {}}>
      <boxGeometry /><meshBasicMaterial color={DIVERGING.neutral} transparent opacity={0.24} depthWrite={false} fog={false} />
    </instancedMesh>
    <SegmentLines points={lines} color={DIVERGING.neutral} opacity={0.65} />
    {spans.filter((s) => s.w > 8).map((span) => <ScreenLabel key={span.x} id={`stall-${span.x}`} position={[span.x + span.w / 2, Math.min(height, 3), -3]} priority={15}>main idle · blocking request in flight</ScreenLabel>)}
  </group>;
}
