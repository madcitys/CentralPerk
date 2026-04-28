import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    const backendBase = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_GATEWAY_URL || "").replace(/\/+$/, "");
    if (!backendBase) return [];
    return [
      { source: "/health", destination: `${backendBase}/health` },
      { source: "/points/:path*", destination: `${backendBase}/points/:path*` },
      { source: "/members/:path*", destination: `${backendBase}/members/:path*` },
      { source: "/campaigns/:path*", destination: `${backendBase}/campaigns/:path*` },
      { source: "/segments/:path*", destination: `${backendBase}/segments/:path*` },
      { source: "/communications/:path*", destination: `${backendBase}/communications/:path*` },
      { source: "/notifications/:path*", destination: `${backendBase}/notifications/:path*` },
      { source: "/partners/:path*", destination: `${backendBase}/partners/:path*` },
      { source: "/events/:path*", destination: `${backendBase}/events/:path*` },
    ];
  },
  experimental: {
    workerThreads: false,
    webpackBuildWorker: false,
  },
};

export default nextConfig;
