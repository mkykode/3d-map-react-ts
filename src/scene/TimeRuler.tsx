import { useMemo } from "react";
import { formatMs, GRID_LINE, niceTickStep, TIME_W, xOf } from "./layout";
import { ScreenLabel } from "./ScreenLabels";
import { SegmentLines } from "./SegmentLines";
import type { Vector3Tuple } from "./cameraActions";

export function TimeRuler({ rangeMs, depth, offsetMs = 0 }: { rangeMs: number; depth: number; offsetMs?: number }) {
  const ticks = useMemo(() => {
    const step = niceTickStep(rangeMs);
    const result: number[] = [];
    if (rangeMs <= 0 || !Number.isFinite(step)) return result;
    for (let t = Math.ceil(offsetMs / step) * step; t <= offsetMs + rangeMs; t += step) result.push(t);
    return result;
  }, [rangeMs, offsetMs]);
  const points = useMemo<Vector3Tuple[]>(() => ticks.flatMap((t) => {
    const x = xOf(t - offsetMs, rangeMs);
    return [[x, 0.12, -4], [x, 0.12, depth + 1]] as Vector3Tuple[];
  }), [ticks, rangeMs, offsetMs, depth]);
  return <group>
    <SegmentLines points={points} color={GRID_LINE} />
    {ticks.map((t) => <ScreenLabel key={t} id={`tick-${t}`} position={[xOf(t - offsetMs, rangeMs), 0.2, depth + 4]} priority={20}>{formatMs(t)}</ScreenLabel>)}
    <ScreenLabel id="time-direction" position={[TIME_W + 2, 0.2, depth + 4]} align="left" priority={25}>time →</ScreenLabel>
  </group>;
}
