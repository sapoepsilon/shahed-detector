import type { NextConfig } from "next";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "shahed-detector.panda-anaconda.ts.net",
    "*.ts.net",
  ],
  // Allow large video uploads to flow through the rewrite proxy.
  // Default is 10MB which truncates anything bigger and causes ECONNRESET.
  // @ts-expect-error – middlewareClientMaxBodySize is supported by the warning even if not yet typed.
  middlewareClientMaxBodySize: "500mb",
  experimental: {
    // proxyTimeout in ms — large videos can take >30s to inference + transcode.
    proxyTimeout: 600_000,
    // Server actions / form bodies up to 500MB.
    serverActions: { bodySizeLimit: "500mb" },
  },
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
