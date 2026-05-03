import type { NextConfig } from "next";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  // Trust the tailnet/funnel reverse proxy so Next doesn't 502 on host-header
  // mismatches. Restrict to your own tailnet domain in production.
  allowedDevOrigins: [
    "shahed-detector.panda-anaconda.ts.net",
    "*.ts.net",
  ],
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${BACKEND}/:path*`,
      },
    ];
  },
};

export default nextConfig;
