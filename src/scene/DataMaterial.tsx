import { useLayoutEffect, useRef } from "react";
import { Color, Vector2, type WebGLProgramParametersWithUniforms } from "three";
import { DIM_TARGET } from "./layout";
import { STATUS_SERIOUS } from "../engine/categories";

/** Unlit data colors: top = palette, side shades are fixed at every camera angle. */
export function DataMaterial({ brush = null, selectedName = -1, names = false, status = false, highlight = false, timeRanges = false }: {
  brush?: readonly [number, number] | null;
  selectedName?: number;
  names?: boolean;
  status?: boolean;
  highlight?: boolean;
  timeRanges?: boolean;
}) {
  const uniforms = useRef({
    traceBrush: { value: new Vector2(-1e12, 1e12) },
    traceSelectedName: { value: -1 },
    traceDim: { value: new Color(DIM_TARGET) },
    traceStatusColor: { value: new Color(STATUS_SERIOUS) },
  });
  useLayoutEffect(() => {
    uniforms.current.traceBrush.value.set(brush?.[0] ?? -1e12, brush?.[1] ?? 1e12);
    uniforms.current.traceSelectedName.value = selectedName;
  }, [brush, selectedName]);

  const compile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms.current);
    shader.vertexShader = `${names ? "attribute float traceName; varying float vTraceName;" : ""}
      ${status ? "attribute float traceStatus; varying float vTraceStatus;" : ""}
      ${timeRanges ? "attribute vec2 traceWindow; varying vec2 vTraceWindow;" : ""}
      varying vec2 vTraceUv; varying vec3 vTraceNormal; varying float vTraceX;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vTraceUv = uv; vTraceNormal = normal;
        ${names ? "vTraceName = traceName;" : ""}
        ${status ? "vTraceStatus = traceStatus;" : ""}
        ${timeRanges ? "vTraceWindow = traceWindow;" : ""}
        vTraceX = (instanceMatrix * vec4(position, 1.0)).x;`);
    shader.fragmentShader = `uniform vec2 traceBrush; uniform float traceSelectedName; uniform vec3 traceDim; uniform vec3 traceStatusColor;
      ${status ? "varying float vTraceStatus;" : ""}
      ${names ? "varying float vTraceName;" : ""}
      ${timeRanges ? "varying vec2 vTraceWindow;" : ""}
      varying vec2 vTraceUv; varying vec3 vTraceNormal; varying float vTraceX;\n${shader.fragmentShader}`
      .replace("#include <opaque_fragment>", `
        float shade = abs(vTraceNormal.y) > 0.5 ? 1.0 : (abs(vTraceNormal.x) > 0.5 ? 0.78 : 0.64);
        vec2 pixelWidth = max(fwidth(vTraceUv), vec2(0.00001));
        vec2 edgeDistance = min(vTraceUv, 1.0 - vTraceUv) / pixelWidth;
        float edge = smoothstep(0.25, 1.1, min(edgeDistance.x, edgeDistance.y));
        // Fade borders on subpixel faces, rather than turning tiny events black.
        float borderStrength = min(1.0, 0.15 / max(pixelWidth.x, pixelWidth.y));
        outgoingLight *= shade * mix(1.0, mix(0.45, 1.0, edge), borderStrength);
        ${status ? "if (vTraceStatus > 0.5 && vTraceUv.y / pixelWidth.y < 1.8 && (vTraceStatus < 1.5 || fract(vTraceUv.x / pixelWidth.x / 8.0) < 0.5)) outgoingLight = traceStatusColor;" : ""}
        bool filtered = ${timeRanges ? "vTraceWindow.y < traceBrush.x || vTraceWindow.x > traceBrush.y" : "vTraceX < traceBrush.x || vTraceX > traceBrush.y"};
        ${names ? "filtered = filtered || (traceSelectedName != -1.0 && abs(traceSelectedName - vTraceName) > 0.25);" : ""}
        if (filtered) outgoingLight = mix(outgoingLight, traceDim, 0.82);
        #include <opaque_fragment>`);
  };

  return <meshBasicMaterial fog={false} toneMapped={false} polygonOffset={highlight} polygonOffsetFactor={-1} polygonOffsetUnits={-1} onBeforeCompile={compile} customProgramCacheKey={() => `trace-box-v1-${names}-${status}-${timeRanges}`} />;
}
