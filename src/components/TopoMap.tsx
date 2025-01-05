import { useMemo } from "react";
import * as THREE from "three";
import { createNoise2D } from 'simplex-noise';

interface GridData {
  x: number;
  y: number;
  value: number;
}

function TopoMap() {
  const gridData = useMemo(() => generateGridNoise(), []);

  return (
    <group>
      <gridHelper args={[100, 100]} />
      {gridData.map((point, index) => (
        <mesh
          key={index}
          position={[point.x - 37.5, point.value / 2, point.y - 37.5]}
        >
          <boxGeometry args={[1.00, point.value, 1.00]} />
          <meshStandardMaterial
            color={new THREE.Color(point.value / 5, 0, 1 - point.value / 5)}
          />
        </mesh>
      ))}
    </group>
  );
}

function generateGridNoise(): GridData[] {
  const data: GridData[] = [];
  const gridSize = 75;
  const noise2D = createNoise2D();

  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      // Multiple layers of noise for more interesting terrain
      const value = Math.abs(
        noise2D(x * 0.2, y * 0.2) * 5 +     // Base terrain
        noise2D(x * 0.4, y * 0.4) * 2.5     // Add detail
      );
      data.push({ x, y, value });
    }
  }
  return data;
}

export default TopoMap;
