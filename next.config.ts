import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "10.10.12.16"],
  output: "standalone",
};

export default nextConfig;
