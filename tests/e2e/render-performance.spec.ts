import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import type { InstancedMesh } from "three";
import type { SceneDebugHost } from "../../src/scene/diagnostics";
import type { useAppStore } from "../../src/state/store";
import { makeTraceUpload, openWorkspace } from "./fixtures";
import { STREAM_LIMITS } from "../../src/engine/ingest/budget";

test.setTimeout(120_000);
test.use({ trace: "off" });
for (const source of ["recorded", "70-second synthetic"] as const) test(`${source} trace uses LOD and records sustained navigation cost`, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openWorkspace(page);
  await expect(page.locator(".stats")).toContainText("events", { timeout: 15_000 });
  const upload = source === "recorded" ? resolve("data/Trace-20250104T162142.json") : makeTraceUpload({ runId: "long-render-stress", eventCount: 100_000, taskSpacingUs: 700, taskDurationUs: 600 });
  await page.locator('input[type="file"]').first().setInputFiles(upload);
  if (typeof upload === "string" || upload.buffer.byteLength > STREAM_LIMITS.largeFileBytes) {
    const dialog = page.getByRole("dialog", { name: "Choose what to load" });
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole("button", { name: "Load full recording" }).click();
    await expect(page.locator(".trace-import-panel")).not.toBeVisible({ timeout: 60_000 });
  }
  await expect(page.locator(".stats")).not.toContainText("15,498", { timeout: 60_000 });
  await expect(page.locator(".stats")).toContainText("events", { timeout: 60_000 });
  await expect(page.locator("#trace-camera")).toHaveAttribute("data-camera-transitioning", "false", { timeout: 15_000 });
  const metrics = await page.evaluate(() => {
    const root = (document.getElementById("trace-camera") as SceneDebugHost).traceScene!();
    let source = 0, instances = 0, aggregated = 0;
    root.scene.traverse((object) => { if (object.name.startsWith("canyon-lane-")) { source += object.userData.sourceEvents; aggregated += object.userData.aggregatedEvents; instances += (object as InstancedMesh).count; } });
    const state = root.scene.userData.getAppState() as ReturnType<typeof useAppStore.getState>;
    const gl = root.gl.getContext(), extension = gl.getExtension("WEBGL_debug_renderer_info");
    return { source, instances, aggregated, calls: root.gl.info.render.calls, rangeMs: state.model!.rangeMs, parseMs: state.model!.parseMs, renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) as string : gl.getParameter(gl.RENDERER) as string };
  });
  expect(metrics.rangeMs).toBeGreaterThan(source === "recorded" ? 5000 : 60_000);
  expect(metrics.instances).toBeLessThan(metrics.source / 2);
  expect(metrics.calls).toBeLessThan(60);
  await page.locator("#trace-camera").focus();
  await page.keyboard.down("q");
  const intervals = await page.evaluate(() => new Promise<number[]>((resolve) => {
    const times: number[] = []; let previous = 0;
    const sample = (now: number) => { if (previous) times.push(now - previous); previous = now; if (times.length < 60) requestAnimationFrame(sample); else resolve(times); };
    requestAnimationFrame(sample);
  }));
  await page.keyboard.up("q");
  intervals.sort((a, b) => a - b);
  await test.info().attach("long-trace-metrics", { body: JSON.stringify({ ...metrics, frameMedianMs: intervals[30], frameP95Ms: intervals[57] }, null, 2), contentType: "application/json" });
  console.log(`${source} render metrics`, JSON.stringify({ ...metrics, frameMedianMs: intervals[30], frameP95Ms: intervals[57] }));
  await page.screenshot({ path: test.info().outputPath("long-trace.png") });
  expect(errors).toEqual([]);
});
