import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  // Dev server: other addresses that may load it, e.g. a phone in the LAN (ALLOWED_DEV_ORIGINS=192.168.1.20,…)
  allowedDevOrigins: ["127.0.0.1", ...(process.env.ALLOWED_DEV_ORIGINS?.split(",").map(o => o.trim()).filter(Boolean) ?? [])],
  output: "standalone",
  // No next/image in use. Without the image optimizer the server never loads sharp, the only native code in the
  // build — the Dockerfile removes it, so the image is built once natively and only copied for arm64
  images: { unoptimized: true },
  // Version and which build this is (src/lib/version.ts), inlined so the browser doesn't load package.json.
  // APP_BUILD is set by the CI, "dev" for local builds
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version, NEXT_PUBLIC_APP_BUILD: process.env.APP_BUILD ?? "dev" },
};

export default nextConfig;
