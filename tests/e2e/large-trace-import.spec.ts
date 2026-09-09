import { expect, test } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { makeTraceUpload, openWorkspace } from "./fixtures";

test.setTimeout(120_000);

function largeUpload() {
  const fixture = JSON.parse(makeTraceUpload({ eventCount: 100 }).buffer.toString());
  const bookkeeping = { name: "v8.callFunction", cat: "v8", ph: "X", pid: 1, tid: 1, ts: 1_000_000, dur: 1, args: { note: "x".repeat(1024) } };
  fixture.traceEvents.push(...Array.from({ length: 32_000 }, () => bookkeeping));
  return { name: "large-recording.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)) };
}

test("streams a file above the old effective threshold, preserves interaction, and reports reductions", async ({ page }, testInfo) => {
  await openWorkspace(page);
  const upload = largeUpload();
  // More than 100 MB on disk, but only the small useful fixture is retained.
  const source = JSON.parse(upload.buffer.toString());
  source.traceEvents.push(...Array.from({ length: 70_000 }, () => source.traceEvents.at(-1)));
  upload.buffer = Buffer.from(JSON.stringify(source));
  expect(upload.buffer.byteLength).toBeGreaterThan(100_000_000);
  const inputPath = testInfo.outputPath("large-recording.json");
  await writeFile(inputPath, upload.buffer);
  await page.locator('input[type="file"]').first().setInputFiles(inputPath);
  const dialog = page.getByRole("dialog", { name: "Choose what to load" });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByRole("button", { name: "Load full recording" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Load full recording" }).click();
  await expect(page.locator(".trace-import-panel")).not.toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel("Import scope")).toContainText("102,000");
  await expect(page.locator("#app-error")).toHaveText("");
  await page.getByRole("button", { name: "City", exact: true }).click();
  await expect(page.getByRole("button", { name: "City", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Change interval" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("supports gzip comparison windows and accessible narrow-screen controls", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await openWorkspace(page);
  await page.getByRole("button", { name: "Toolbar controls" }).click();
  // The picker is decided by decompressed size, so a small gzip file loads
  // exactly like its uncompressed twin; pad this one past the threshold.
  const fixture = makeTraceUpload({ eventCount: 100, taskSpacingUs: 100_000 });
  const padded = JSON.parse(fixture.buffer.toString());
  const bookkeeping = { name: "v8.callFunction", cat: "v8", ph: "X", pid: 1, tid: 1, ts: 1_000_000, dur: 1, args: { note: "x".repeat(1024) } };
  padded.traceEvents.push(...Array.from({ length: 33_000 }, () => bookkeeping));
  await page.locator('input[type="file"]').nth(1).setInputFiles({ ...fixture, name: "comparison.json.gz", buffer: gzipSync(Buffer.from(JSON.stringify(padded))) });
  const dialog = page.getByRole("dialog", { name: "Choose what to load" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Start (seconds)").fill("1");
  await dialog.getByLabel("End (seconds)").fill("0");
  await expect(dialog.getByRole("button", { name: "Load selected interval" })).toBeDisabled();
  await dialog.getByLabel("End (seconds)").fill("3");
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await dialog.getByRole("button", { name: "Load selected interval" }).click();
  await expect(page.locator(".trace-import-panel")).not.toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Diff", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Import scope")).toContainText("selected interval");
  await expect(page.locator("#app-error")).toHaveText("");
});

test("cancels a large scan and can import another file afterwards", async ({ page }) => {
  await openWorkspace(page);
  await page.locator('input[type="file"]').first().setInputFiles(largeUpload());
  await page.getByRole("button", { name: "Cancel trace import" }).click();
  await expect(page.locator(".trace-import-panel")).not.toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(makeTraceUpload({ eventCount: 100 }));
  await expect(page.locator("#app-status")).toHaveText("", { timeout: 60_000 });
  await expect(page.locator("#app-error")).toHaveText("");
});
