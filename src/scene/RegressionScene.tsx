import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { FindingId } from "../domain/analysis";
import { DIVERGING } from "../engine/categories";
import type {
  RegressionMark,
  RegressionProjection,
} from "../engine/findingContract";
import { GROUND } from "./layout";
import { DataMaterial } from "./DataMaterial";
import { ScreenLabel } from "./ScreenLabels";
import { BoxFeedback } from "./BoxFeedback";
import { uploadInstances } from "./instanceBuffers";
import { SCENE_DEBUG } from "./diagnostics";
import { useHoverStore } from "../state/store";
import {
  regressionMarkAtInstance,
  regressionProjectionBounds,
  regressionMarkBounds,
} from "./regressionPicking";

const dummy = new THREE.Object3D();
const pickPoint = new THREE.Vector3();
const regressionColor = new THREE.Color(DIVERGING.regression);
const improvementColor = new THREE.Color(DIVERGING.improvement);
const neutralColor = new THREE.Color(DIVERGING.neutral);

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
  const hoveredIndex = useHoverStore((s) => s.hover?.lane === -6 ? s.hover.idx : -1);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    projection.marks.forEach((mark, index) => {
      dummy.position.set(...mark.position);
      dummy.scale.set(...mark.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      const color = colorFor(mark);
      mesh.setColorAt(index, color);
    });
    uploadInstances(mesh, projection.marks.length, regressionProjectionBounds(projection.marks));
    invalidate();
  }, [invalidate, projection]);

  useFrame(() => {
    if (!SCENE_DEBUG) return;
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
    if (!SCENE_DEBUG) return;
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

  const selected = projection.marks.find((m) => m.findingId === selectedFindingId);

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
        <meshBasicMaterial color={GROUND} side={THREE.DoubleSide} />
      </mesh>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, Math.max(projection.marks.length, 1)]}
        count={projection.marks.length}
        onPointerMove={(event) => {
          const mark = regressionMarkAtInstance(projection.marks, event.instanceId);
          if (!mark) return;
          event.stopPropagation();
          useHoverStore.getState().setHover({ lane: -6, idx: event.instanceId!, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY, summary: { title: mark.title, catId: 6, detail: `${mark.status}${mark.gap ? " · evidence gap" : ""}` } });
        }}
        onPointerOut={() => useHoverStore.getState().setHover(null)}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          if (event.delta > 4) return;
          const mark = regressionMarkAtInstance(projection.marks, event.instanceId);
          if (mark) onSelect(mark);
        }}
      >
        <boxGeometry />
        <DataMaterial />
      </instancedMesh>
      {scales.map((scale) => (
        <ScreenLabel
          key={scale.id}
          id={`regression-scale-${scale.id}`}
          align="right"
          priority={30}
          position={[
            bounds.min[0] - 1,
            2,
            projection.marks.find((mark) => mark.kind === scale.markKind)
              ?.position[2] ?? centerZ,
          ]}
        >
            {scale.label} · max {scale.maxAbsoluteDelta.toFixed(1)}
        </ScreenLabel>
      ))}
      <ScreenLabel id="regression-units" position={[centerX, bounds.max[1] + 2, centerZ]} priority={40}>
          each lane declares its own unit and linear scale · gaps have no edges
      </ScreenLabel>
      {selected && <BoxFeedback bounds={regressionMarkBounds(selected)} label={selected.title} />}
      {projection.marks[hoveredIndex] && projection.marks[hoveredIndex] !== selected && <BoxFeedback id="hovered-mark" bounds={regressionMarkBounds(projection.marks[hoveredIndex])} label={projection.marks[hoveredIndex].title} />}
    </group>
  );
}

function colorFor(mark: RegressionMark): THREE.Color {
  if (mark.gap) return neutralColor;
  if (mark.status === "regression" || mark.status === "added") {
    return regressionColor;
  }
  if (mark.status === "improvement" || mark.status === "removed") {
    return improvementColor;
  }
  return neutralColor;
}
