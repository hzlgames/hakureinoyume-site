import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placeholder.co"
      },
      {
        protocol: "https",
        hostname: "*.music.126.net"
      },
      {
        protocol: "http",
        hostname: "*.music.126.net"
      }
    ]
  }
};

export default nextConfig;
