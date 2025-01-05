import { useMemo, useState } from "react";
import * as THREE from "three";
import { createNoise2D } from "simplex-noise";

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

function getColorForEvent(event?: TraceData) {
  if (!event) return new THREE.Color(0.5, 0.5, 0.5);
  
  // Different colors for different event categories
  switch(event.name) {
    case 'RunTask':
      return new THREE.Color(1, 0, 0);  // Red
    case 'EvaluateScript':
      return new THREE.Color(0, 1, 0);  // Green
    case 'CompileScript':
      return new THREE.Color(0, 0, 1);  // Blue
    default:
      return new THREE.Color(0.5, 0.5, 0.5);  // Grey
  }
}
function TopoMap({
  traceData,
}: {
  traceData: TraceData[];
}) {
  const gridData = useMemo(
    () =>
      traceData.length > 0
        ? generateGridFromTrace(traceData)
        : generateDefaultGrid(),
    [traceData],
  );

  return (
    <>
      <group>
        <gridHelper args={[75, 75]} />
        {gridData.map((point, index) => (
          <mesh
            key={index}
            position={[point.x - 10, point.value / 2, point.y - 10]}
          >
            <boxGeometry args={[1, point.value, 1]} />
            <meshStandardMaterial
              color={getColorForEvent(point.traceEvent)}
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

  // Find min/max durations for normalization
  const maxDuration = Math.max(...traceData.map((t) => t.dur));
  const minDuration = Math.min(...traceData.map((t) => t.dur));

  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      // Map grid position to trace data index
      const dataIndex = Math.floor((x * gridSize + y) % traceData.length);
      const traceItem = traceData[dataIndex];

      // Normalize duration to a reasonable height value
      const normalizedValue =
        ((traceItem.dur - minDuration) / (maxDuration - minDuration)) * 5;

      // Add some noise for variation
      const noiseValue = noise2D(x * 0.2, y * 0.2) * 1.5;

      data.push({
        x,
        y,
        value: normalizedValue + noiseValue,
        traceEvent: traceItem  // Store the trace event
      });
    }
  }
  return data;
}

function generateDefaultGrid(): GridData[] {
  const data: GridData[] = [];
  const gridSize = 15;
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
