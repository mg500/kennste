import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "10.10.12.16"],
  output: "standalone",
  // No next/image in use. Without the image optimizer the server never loads sharp, the only native code in the
  // build — the Dockerfile removes it, so the image is built once natively and only copied for arm64
  images: { unoptimized: true },
};

export default nextConfig;
