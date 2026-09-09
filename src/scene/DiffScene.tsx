import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { EvidenceIdentity } from "../domain/evidence";
import { CAT_ID, DIVERGING } from "../engine/categories";
import type {
  FindingProjection,
  FindingProjectionMark,
} from "../engine/findingContract";
import {
  LANE_D,
  LANE_GAP,
} from "./layout";
import { DataMaterial } from "./DataMaterial";
import { ScreenLabel } from "./ScreenLabels";
import { SCENE_DEBUG } from "./diagnostics";
import { uploadInstances } from "./instanceBuffers";
import { diffMarkBounds, diffProjectionBounds, DIFF_MARK_W as MARK_W, DIFF_MARK_H as MARK_H, DIFF_ZERO_Y as ZERO_Y } from "./diffLayout";
import { BoxFeedback } from "./BoxFeedback";
import { useHoverStore } from "../state/store";

const dummy = new THREE.Object3D();
const pickPoint = new THREE.Vector3();
const regressionColor = new THREE.Color(DIVERGING.regression);
const improvementColor = new THREE.Color(DIVERGING.improvement);
const neutralColor = new THREE.Color(DIVERGING.neutral);

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
  const bounds = useMemo(() => diffProjectionBounds(projection.marks), [projection]);
  const hoveredIndex = useHoverStore((s) => s.hover?.source === "diff" ? s.hover.idx : -1);
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
      mesh.setColorAt(index, color);
    });
    uploadInstances(mesh, projection.marks.length, bounds);
  }, [projection, bounds]);

  useFrame(() => {
    if (!SCENE_DEBUG) return;
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
        position={[width / 2, ZERO_Y, worldDepth / 2 - LANE_GAP / 2]}
      >
        <planeGeometry args={[width + 8, worldDepth + 8]} />
        <meshBasicMaterial
          color={DIVERGING.neutral}
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, Math.max(projection.marks.length, 1)]}
        count={projection.marks.length}
        onPointerMove={(event) => {
          if (event.instanceId === undefined) return;
          event.stopPropagation();
          const mark = projection.marks[event.instanceId];
          useHoverStore.getState().setHover({ source: "diff", idx: event.instanceId, clientX: event.nativeEvent.clientX, clientY: event.nativeEvent.clientY, summary: { title: mark.title, catId: CAT_ID.system, detail: `${mark.status} · ${mark.domain} · ${mark.unit}` } });
        }}
        onPointerOut={() => useHoverStore.getState().setHover(null)}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          if (event.instanceId === undefined || event.delta > 4) return;
          const mark = projection.marks[event.instanceId];
          if (mark) onSelect(mark);
        }}
      >
        <boxGeometry />
        <DataMaterial />
      </instancedMesh>
      {projection.marks.filter((m, i) => m.evidenceId === selectedEvidenceId || i === hoveredIndex).map((mark) => <BoxFeedback key={mark.evidenceId} id={`diff-feedback-${mark.evidenceId}`} bounds={diffMarkBounds(mark, domains)} label={mark.title} />)}
      {domains.map((domain, index) => {
        const mark = projection.marks.find((candidate) => candidate.domain === domain);
        return (
          <ScreenLabel key={domain} id={`diff-domain-${domain}`} position={[-3, ZERO_Y, index * LANE_GAP]} align="right" priority={30}>
              {domain} · {mark?.unit ?? "unknown"}
          </ScreenLabel>
        );
      })}
      <ScreenLabel id="diff-units" position={[width / 2, ZERO_Y + MARK_H + 4, worldDepth / 2]} priority={40}>
          ranked findings · height is normalized only within each domain and unit
      </ScreenLabel>
    </group>
  );
}

function colorFor(mark: FindingProjectionMark): THREE.Color {
  if (mark.status === "regression" || mark.status === "added") {
    return regressionColor;
  }
  if (mark.status === "improvement" || mark.status === "removed") {
    return improvementColor;
  }
  return neutralColor;
}
