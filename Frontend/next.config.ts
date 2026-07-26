import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Emit a self-contained server bundle so the Docker image can run without the
  // full node_modules tree. Ignored by Vercel, which handles output itself.
  output: "standalone",
};

export default nextConfig;
