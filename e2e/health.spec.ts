import { expect, test } from "@playwright/test";
import pkg from "../package.json";

test("Der Server meldet sich unter /api/health (für Docker und Reverse-Proxy)", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok", version: pkg.version });
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("Lässt sich zum Startbildschirm hinzufügen: Manifest und Icons", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ short_name: "Kennste?!", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).headers()["content-type"]).toBe("image/png");
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(appleIcon!)).ok()).toBe(true);
});
