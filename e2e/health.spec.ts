import { expect, test } from "@playwright/test";

test("Der Server meldet sich unter /api/health (für Docker und Reverse-Proxy)", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
  expect(res.headers()["cache-control"]).toContain("no-store");
});
