import { useMemo, useState } from "react";
import { createNoise2D } from "simplex-noise";
import { getColorForEvent, getColorForEventCategory, getColorForEventHash } from "../lib/getColorForEvent";

export interface GridData {
  x: number;
  y: number;
  value: number;
}

export interface TraceData {
  ts: number; // timestamp
  dur: number; // duration
  name: string; // event name
  cat: string; // category
  ph: string; // phase
  pid: number; // process ID
  tid: number; // thread ID
}

// File input handler


function TopoMap({ traceData }: { traceData: TraceData[] }) {
  const traceDataNotEmpty = traceData.length > 0;
  const gridData = useMemo(
    () =>
      traceDataNotEmpty
        ? generateGridFromTrace(traceData)
        : generateDefaultGrid(),
    [traceData, traceDataNotEmpty],
  );

  return (
    <>
      <group>
        <gridHelper args={[75, 75]} />
        {gridData.map((point, index) => (
          <mesh
            key={index}
            position={[
              point.x - 10, 
              Math.max(0.01, point.value / 2), // Ensure minimum height is above 0
              point.y - 10
            ]}
          >
            <boxGeometry args={[1, Math.max(0.02, point.value), 1]} /> {/* Ensure minimum height */}
            <meshStandardMaterial
              color={getColorForEventCategory(point.traceEvent, point.value)}
            />
          </mesh>
        ))}
      </group>
    </>
  );
}
export function processTraceEvents(events: any[]): TraceData[] {
  return events
    .filter(
      (event) =>
        // Filter for events that have duration and are from the timeline
        event.dur && event.cat.includes("devtools.timeline"),
    )
    .map((event) => ({
      ts: event.ts,
      dur: event.dur,
      name: event.name,
      cat: event.cat,
      ph: event.ph,
      pid: event.pid,
      tid: event.tid,
    }));
}


function generateGridFromTrace(traceData: TraceData[]): GridData[] {
  const data: GridData[] = [];
  const gridSize = 37.5;
  const noise2D = createNoise2D();
  const HEIGHT_MULTIPLIER = 50; // Increased from 5 to 15 for more pronounced heights
  const NOISE_INFLUENCE = 1; // Slight noise for variation

  // Find min/max durations for normalization
  const maxDuration = Math.max(...traceData.map((t) => t.dur));
  const minDuration = Math.min(...traceData.map((t) => t.dur));

  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      const dataIndex = Math.floor((x * gridSize + y) % traceData.length);
      const traceItem = traceData[dataIndex];

      // Normalize duration with increased height multiplier
      const normalizedValue =
        ((traceItem.dur - minDuration) / (maxDuration - minDuration)) * HEIGHT_MULTIPLIER;

      // Add some noise for variation
      const noiseValue = noise2D(x * 0.2, y * 0.2) * 2 * NOISE_INFLUENCE;

      // Apply a power function to make differences more pronounced
      const heightValue = Math.pow(normalizedValue, 1.5); // Exponential scaling

      data.push({
        x,
        y,
        value: heightValue + noiseValue,
        traceEvent: traceItem,
      });
    }
  }
  return data;
}

function generateDefaultGrid(): GridData[] {
  const data: GridData[] = [];
  const gridSize = 37;
  const noise2D = createNoise2D();

  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      const value = Math.abs(
        noise2D(x * 0.2, y * 0.2) * 5 + noise2D(x * 0.4, y * 0.4) * 2.5,
      );
      data.push({ x, y, value });
    }
  }
  return data;
}

export default TopoMap;
