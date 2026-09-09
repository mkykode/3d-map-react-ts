import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Group } from "three";

interface LabelRecord { id: string; anchor: Group; element: HTMLSpanElement; priority: number; width: number; height: number; align: "center" | "right" | "left" }
const Registry = createContext<Map<string, LabelRecord> | null>(null);

/** One projected overlay. Greedy priority culling prevents label collisions. */
export function LabelLayer({ children }: { children: ReactNode }) {
  const records = useMemo(() => new Map<string, LabelRecord>(), []);
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld();
    const occupied: { x: number; y: number; w: number; h: number }[] = [];
    const sorted = [...records.values()].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    for (const label of sorted) {
      label.anchor.getWorldPosition(point).project(camera);
      const x = (point.x + 1) * size.width / 2 - (label.align === "right" ? label.width : label.align === "center" ? label.width / 2 : 0);
      const y = (1 - point.y) * size.height / 2 - label.height / 2;
      const visible = point.z >= -1 && point.z <= 1 && x >= 4 && y >= 4 && x + label.width < size.width - 4 && y + label.height < size.height - 4 && !occupied.some((b) => x < b.x + b.w + 8 && x + label.width + 8 > b.x && y < b.y + b.h + 4 && y + label.height + 4 > b.y);
      label.element.style.visibility = visible ? "visible" : "hidden";
      if (visible) {
        label.element.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
        occupied.push({ x, y, w: label.width, h: label.height });
      }
    }
  });
  return <Registry.Provider value={records}>{children}</Registry.Provider>;
}

export function ScreenLabel({ id, position, children, priority = 0, align = "center", kind = "default" }: {
  id: string; position: [number, number, number]; children: ReactNode; priority?: number; align?: LabelRecord["align"]; kind?: string;
}) {
  const records = useContext(Registry);
  const anchor = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const attach = useCallback((element: HTMLSpanElement | null) => {
    if (!records || !anchor.current || !element) return;
    const label: LabelRecord = { id, anchor: anchor.current, element, priority, align, width: 0, height: 0 };
    const measure = () => {
      label.width = label.element.offsetWidth;
      label.height = label.element.offsetHeight;
      invalidate();
    };
    records.set(id, label);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(label.element);
    return () => { observer.disconnect(); records.delete(id); };
  }, [records, id, priority, align, invalidate]);
  return <group ref={anchor} position={position}><Html calculatePosition={() => [0, 0, 0]} zIndexRange={[2, 2]} style={{ pointerEvents: "none" }}>
    <span ref={attach} aria-hidden="true" data-scene-label={id} className={`scene-label scene-label-${kind}`}>{children}</span>
  </Html></group>;
}
