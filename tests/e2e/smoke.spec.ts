import { expect, test } from "@playwright/test";

test("opens the trace workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Trace Topography");
  await expect(page.getByText("Trace Topography", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("application", { name: "Interactive 3D trace" }),
  ).toBeVisible();
  await expect(page.locator(".stats")).toContainText("events", {
    timeout: 15_000,
  });
  await expect(page.locator(".overlay-message.error")).toHaveCount(0);
});
