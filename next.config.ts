import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev server: other addresses that may load it, e.g. a phone in the LAN (ALLOWED_DEV_ORIGINS=192.168.1.20,…)
  allowedDevOrigins: ["127.0.0.1", ...(process.env.ALLOWED_DEV_ORIGINS?.split(",").map(o => o.trim()).filter(Boolean) ?? [])],
  output: "standalone",
  // No next/image in use. Without the image optimizer the server never loads sharp, the only native code in the
  // build — the Dockerfile removes it, so the image is built once natively and only copied for arm64
  images: { unoptimized: true },
};

export default nextConfig;
