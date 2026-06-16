import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server in .next/standalone for slim container images
  // (used by the Fly.io Dockerfile). Harmless for local dev and `next start`.
  output: "standalone",
};

export default nextConfig;
