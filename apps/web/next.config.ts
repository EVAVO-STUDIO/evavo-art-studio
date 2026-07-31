import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    "@evavo/art-contracts",
    "@evavo/art-core",
    "@evavo/art-direction",
    "@evavo/art-quality",
  ],
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
