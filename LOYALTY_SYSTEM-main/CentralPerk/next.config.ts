import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    return [
      { source: "/points/:path*", destination: "/api/points/:path*" },
      { source: "/events/:path*", destination: "/api/events/:path*" },
      { source: "/campaigns/:path*", destination: "/api/campaigns/:path*" },
      { source: "/segments/:path*", destination: "/api/segments/:path*" },
      { source: "/members/:path*", destination: "/api/members/:path*" },
      { source: "/notifications/:path*", destination: "/api/notifications/:path*" },
      { source: "/partners/:path*", destination: "/api/partners/:path*" },
      { source: "/communications/:path*", destination: "/api/communications/:path*" },
      { source: "/analytics/:path*", destination: "/api/analytics/:path*" },
      { source: "/unsubscribe", destination: "/api/unsubscribe" },
    ];
  },
  experimental: {
    workerThreads: false,
    webpackBuildWorker: false,
  },
};

export default nextConfig;
