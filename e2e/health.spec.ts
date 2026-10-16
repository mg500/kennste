import { expect, test } from "@playwright/test";
import pkg from "../package.json";

test("Der Server meldet sich unter /api/health (für Docker und Reverse-Proxy)", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok", version: pkg.version });
  expect(res.headers()["cache-control"]).toContain("no-store");
});
