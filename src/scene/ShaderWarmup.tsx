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

  return (
    <group name="shader-warmup" raycast={() => {}}>
      <instancedMesh args={[undefined, undefined, 0]} frustumCulled={false}>
        <boxGeometry />
        <DataMaterial names status />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, 0]} frustumCulled={false}>
        <boxGeometry />
        <DataMaterial names />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, 0]} frustumCulled={false}>
        <boxGeometry />
        <DataMaterial timeRanges />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, 0]} frustumCulled={false}>
        <boxGeometry />
        <DataMaterial />
      </instancedMesh>
    </group>
  );
}
