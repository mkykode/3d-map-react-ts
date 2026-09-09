import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { DataMaterial } from "./DataMaterial";

/**
 * Warm shader programs without blocking, and before the trace arrives.
 *
 * drei's `<Preload all />` calls the synchronous `gl.compile`, which pushes
 * every material through the GPU process in one stall (~0.9 s on
 * ANGLE/Metal) right when the model lands. Two changes remove that stall:
 * `compileAsync` uses KHR_parallel_shader_compile and resolves when the
 * programs are ready, and the zero-count probes below carry every data
 * shader variant from first mount, so those programs compile during the
 * worker parse and stay cached (three releases a program only when its last
 * material is disposed). Zero-count instanced meshes never issue a draw.
 */
export function ShaderWarmup({ token }: { token: string }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    let cancelled = false;
    gl.compileAsync(scene, camera).then(
      () => {
        if (!cancelled) invalidate();
      },
      (error: unknown) => {
        console.error("Shader warmup failed", error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera, invalidate, token]);

  // Every data mesh calls setColorAt, which adds USE_INSTANCING_COLOR to the
  // program key, so the probes carry an instanceColor attribute too or they
  // would warm a program nothing uses.
  return (
    <group name="shader-warmup" raycast={() => {}}>
      {PROBE_VARIANTS.map((variant) => (
        <instancedMesh key={variant.key} args={[undefined, undefined, 0]} frustumCulled={false}>
          <boxGeometry />
          <instancedBufferAttribute attach="instanceColor" args={[new Float32Array(3), 3]} />
          <DataMaterial {...variant.props} />
        </instancedMesh>
      ))}
    </group>
  );
}

const PROBE_VARIANTS: { key: string; props: { names?: boolean; status?: boolean; timeRanges?: boolean } }[] = [
  { key: "canyon", props: { names: true, status: true } },
  { key: "city", props: { names: true } },
  { key: "rhythm", props: { timeRanges: true } },
  { key: "plain", props: {} },
];
