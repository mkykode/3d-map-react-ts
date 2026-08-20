import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/** Deterministic browser seam for proving demand-rendered scenes stay idle. */
export function RenderActivity({ hostId }: { hostId: string }) {
  const count = useRef(0);
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const host = gl.domElement.ownerDocument.getElementById(hostId);
    if (host) host.dataset.renderCount = String(count.current);
  }, [gl, hostId]);

  useFrame(() => {
    count.current += 1;
    const host = gl.domElement.ownerDocument.getElementById(hostId);
    if (host) host.dataset.renderCount = String(count.current);
  });

  return null;
}
