import { useEffect, useLayoutEffect, useRef } from "react";
import { Billboard, Text } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { FindingId } from "../domain/analysis";
import { DIVERGING } from "../engine/categories";
import type {
  RegressionMark,
  RegressionProjection,
} from "../engine/findingContract";
import { GROUND, INK_SECONDARY } from "./layout";
import {
  regressionMarkAtInstance,
  regressionProjectionBounds,
} from "./regressionPicking";

const dummy = new THREE.Object3D();
const pickPoint = new THREE.Vector3();
const selectedColor = new THREE.Color("#f0f4fa");

export function RegressionScene({
  projection,
  selectedFindingId,
  onSelect,
  hostId = "trace-camera",
}: {
  projection: RegressionProjection;
  selectedFindingId: FindingId | null;
  onSelect: (mark: RegressionMark) => void;
  hostId?: string;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const bounds = regressionProjectionBounds(projection.marks);
  const scales = Object.values(projection.scales);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    projection.marks.forEach((mark, index) => {
      dummy.position.set(...mark.position);
      dummy.scale.set(...mark.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      const color = colorFor(mark);
      mesh.setColorAt(
        index,
        mark.findingId === selectedFindingId
          ? color.clone().lerp(selectedColor, 0.32)
          : color,
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [invalidate, projection, selectedFindingId]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || projection.marks.length === 0) return;
    const targetIndex = Math.max(
      0,
      projection.marks.findIndex((mark) => mark.findingId !== selectedFindingId),
    );
    mesh.getMatrixAt(targetIndex, dummy.matrix);
    pickPoint.setFromMatrixPosition(dummy.matrix);
    mesh.localToWorld(pickPoint).project(camera);
    const host = gl.domElement.ownerDocument.getElementById(hostId);
    if (!host) return;
    host.dataset.regressionPickX = String(
      (pickPoint.x + 1) * gl.domElement.clientWidth / 2,
    );
    host.dataset.regressionPickY = String(
      (1 - pickPoint.y) * gl.domElement.clientHeight / 2,
    );
    host.dataset.regressionPickContributor =
      projection.marks[targetIndex].contributorId;
    host.dataset.regressionPickEvidence = projection.marks[targetIndex].evidenceId;
  });

  useEffect(() => {
    const host = gl.domElement.ownerDocument.getElementById(hostId);
    if (!host) return;
    const selected = projection.marks.find(
      (mark) => mark.findingId === selectedFindingId,
    );
    if (selected) {
      host.dataset.regressionSelectedContributor = selected.contributorId;
      host.dataset.regressionSelectedEvidence = selected.evidenceId;
    } else {
      delete host.dataset.regressionSelectedContributor;
      delete host.dataset.regressionSelectedEvidence;
    }
  }, [gl, hostId, projection, selectedFindingId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(frame);
  }, [invalidate, projection, selectedFindingId]);

  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const groundY = Math.min(-0.06, bounds.min[1] - 0.1);
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[centerX, groundY, centerZ]}
      >
        <planeGeometry
          args={[
            Math.max(32, bounds.max[0] - bounds.min[0] + 16),
            Math.max(32, bounds.max[2] - bounds.min[2] + 16),
          ]}
        />
        <meshBasicMaterial color={GROUND} />
      </mesh>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, Math.max(projection.marks.length, 1)]}
        count={projection.marks.length}
        frustumCulled={false}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          const mark = regressionMarkAtInstance(projection.marks, event.instanceId);
          if (mark) onSelect(mark);
        }}
      >
        <boxGeometry />
        <meshLambertMaterial />
      </instancedMesh>
      {scales.map((scale) => (
        <Billboard
          key={scale.id}
          position={[
            bounds.min[0] - 1,
            2,
            projection.marks.find((mark) => mark.kind === scale.markKind)
              ?.position[2] ?? centerZ,
          ]}
        >
          <Text fontSize={0.55} color={INK_SECONDARY} anchorX="right">
            {scale.label} · max {scale.maxAbsoluteDelta.toFixed(1)}
          </Text>
        </Billboard>
      ))}
      <Billboard position={[centerX, bounds.max[1] + 2, centerZ]}>
        <Text fontSize={0.45} color={INK_SECONDARY} anchorX="center">
          each lane declares its own unit and linear scale · gaps have no edges
        </Text>
      </Billboard>
    </group>
  );
}

function colorFor(mark: RegressionMark): THREE.Color {
  if (mark.gap) return new THREE.Color(DIVERGING.neutral);
  if (mark.status === "regression" || mark.status === "added") {
    return new THREE.Color(DIVERGING.regression);
  }
  if (mark.status === "improvement" || mark.status === "removed") {
    return new THREE.Color(DIVERGING.improvement);
  }
  return new THREE.Color(DIVERGING.neutral);
}
