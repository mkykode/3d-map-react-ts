import { chromium, expect, test } from "@playwright/test";

test("reaches the tracked-demo stable workspace within three seconds", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto("http://127.0.0.1:4173/");
    await expect(page.locator(".stats")).toContainText("events", { timeout: 3_000 });
    const stableAtMs = await page.evaluate(() => performance.now());

    expect(stableAtMs).toBeLessThan(3_000);
    await expect(page.getByRole("img", { name: /3D multi-domain regression overview/ })).toHaveCount(0);
    await expect(page.getByRole("application", { name: "Interactive 3D trace" })).toBeVisible();
    await expect(page.locator(".overlay-message")).toHaveCount(0);
    await expect(page.locator(".overlay-message.error")).toHaveCount(0);
  } finally {
    await browser.close();
  }
});
