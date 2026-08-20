import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import type { EvidenceIdentity } from "../domain/evidence";
import { DIVERGING } from "../engine/categories";
import type {
  FindingProjection,
  FindingProjectionMark,
} from "../engine/findingContract";
import {
  GROUND,
  INK_SECONDARY,
  LANE_D,
  LANE_GAP,
} from "./layout";

const MARK_W = 6;
const MARK_H = 10;
const ZERO_Y = 5;
const dummy = new THREE.Object3D();
const pickPoint = new THREE.Vector3();
const selectedColor = new THREE.Color("#f0f4fa");

export function DiffScene({
  projection,
  selectedEvidenceId,
  onSelect,
}: {
  projection: FindingProjection;
  selectedEvidenceId: EvidenceIdentity | null;
  onSelect: (mark: FindingProjectionMark) => void;
}) {
  const domains = [...new Set(projection.marks.map((mark) => mark.domain))];
  const width = Math.max(
    48,
    ...projection.marks.map((mark) => (mark.domainRank + 1) * (MARK_W + 2)),
  );
  const worldDepth = Math.max(domains.length * LANE_GAP, LANE_GAP);
  const ref = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const projectedDomains = [
      ...new Set(projection.marks.map((mark) => mark.domain)),
    ];
    projection.marks.forEach((mark, index) => {
      const height = 0.75 + mark.magnitudeRatio * MARK_H;
      const below = mark.status === "improvement" || mark.status === "removed";
      dummy.position.set(
        mark.domainRank * (MARK_W + 2) + MARK_W / 2,
        below ? ZERO_Y - height / 2 : ZERO_Y + height / 2,
        Math.max(0, projectedDomains.indexOf(mark.domain)) * LANE_GAP,
      );
      dummy.scale.set(MARK_W, height, LANE_D * 0.88);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      const color = colorFor(mark);
      mesh.setColorAt(
        index,
        mark.evidenceId === selectedEvidenceId
          ? color.clone().lerp(selectedColor, 0.32)
          : color,
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [projection, selectedEvidenceId]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || projection.marks.length === 0) return;
    const targetIndex = Math.max(0, projection.marks.findIndex(
      (mark) => mark.evidenceId !== selectedEvidenceId,
    ));
    mesh.getMatrixAt(targetIndex, dummy.matrix);
    pickPoint.setFromMatrixPosition(dummy.matrix);
    mesh.localToWorld(pickPoint).project(camera);
    const host = gl.domElement.ownerDocument.getElementById("trace-camera");
    if (!host) return;
    host.dataset.diffPickX = String((pickPoint.x + 1) * gl.domElement.clientWidth / 2);
    host.dataset.diffPickY = String((1 - pickPoint.y) * gl.domElement.clientHeight / 2);
    host.dataset.diffPickEvidence = projection.marks[targetIndex].evidenceId;
  });

  useEffect(() => () => {
    const host = gl.domElement.ownerDocument.getElementById("trace-camera");
    if (!host) return;
    delete host.dataset.diffPickX;
    delete host.dataset.diffPickY;
    delete host.dataset.diffPickEvidence;
  }, [gl]);

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[width / 2, -0.06, worldDepth / 2 - LANE_GAP / 2]}
      >
        <planeGeometry args={[width + 16, worldDepth + 16]} />
        <meshBasicMaterial color={GROUND} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[width / 2, ZERO_Y, worldDepth / 2 - LANE_GAP / 2]}
      >
        <planeGeometry args={[width + 8, worldDepth + 8]} />
        <meshBasicMaterial
          color={DIVERGING.neutral}
          transparent
          opacity={0.12}
          side={2}
          depthWrite={false}
        />
      </mesh>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, Math.max(projection.marks.length, 1)]}
        count={projection.marks.length}
        frustumCulled={false}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          if (event.instanceId === undefined) return;
          const mark = projection.marks[event.instanceId];
          if (mark) onSelect(mark);
        }}
      >
        <boxGeometry />
        <meshLambertMaterial />
      </instancedMesh>
      {domains.map((domain, index) => {
        const mark = projection.marks.find((candidate) => candidate.domain === domain);
        return (
          <Billboard key={domain} position={[-3, ZERO_Y, index * LANE_GAP]}>
            <Text fontSize={1.05} color={INK_SECONDARY} anchorX="right">
              {domain} · {mark?.unit ?? "unknown"}
            </Text>
          </Billboard>
        );
      })}
      <Billboard position={[width / 2, ZERO_Y + MARK_H + 4, worldDepth / 2]}>
        <Text fontSize={1.15} color={INK_SECONDARY} anchorX="center">
          ranked findings · height is normalized only within each domain and unit
        </Text>
      </Billboard>
    </group>
  );
}

function colorFor(mark: FindingProjectionMark): THREE.Color {
  if (mark.status === "regression" || mark.status === "added") {
    return new THREE.Color(DIVERGING.regression);
  }
  if (mark.status === "improvement" || mark.status === "removed") {
    return new THREE.Color(DIVERGING.improvement);
  }
  return new THREE.Color(DIVERGING.neutral);
}
