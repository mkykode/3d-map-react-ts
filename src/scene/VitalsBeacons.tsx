import { useMemo } from "react";
import type { VitalMarker } from "../engine/types";
import type { Vector3Tuple } from "./cameraActions";
import { INK_SECONDARY, xOf } from "./layout";
import { SegmentLines } from "./SegmentLines";
import { ScreenLabel } from "./ScreenLabels";

export function VitalsBeacons({ markers, rangeMs, depth, height }: { markers: VitalMarker[]; rangeMs: number; depth: number; height: number }) {
  const groups = useMemo(() => {
    const result: { ts: number; labels: string[] }[] = [];
    for (const marker of [...markers].sort((a, b) => a.ts - b.ts)) {
      const last = result[result.length - 1];
      if (last && Math.abs(last.ts - marker.ts) / rangeMs * 160 < 2) {
        if (!last.labels.includes(marker.label)) last.labels.push(marker.label);
      } else result.push({ ts: marker.ts, labels: [marker.label] });
    }
    return result;
  }, [markers, rangeMs]);
  const points = useMemo<Vector3Tuple[]>(() => groups.flatMap((m) => {
    const x = xOf(m.ts, rangeMs);
    return [[x, 0.15, -3], [x, height, -3], [x, 0.15, -3], [x, 0.15, depth]] as Vector3Tuple[];
  }), [groups, rangeMs, depth, height]);
  return <group>
    <SegmentLines points={points} color={INK_SECONDARY} width={1} opacity={0.55} />
    {groups.map((m) => <ScreenLabel key={m.ts} id={`vital-${m.ts}`} position={[xOf(m.ts, rangeMs), height + 1, -3]} priority={60}>{m.labels.join(" · ")}</ScreenLabel>)}
  </group>;
}
