import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  distDir: process.env.COUPLE_WEB_DIST_DIR || ".next",
  transpilePackages: ["@couple/domain", "@couple/api", "@couple/theme"],
  turbopack: { root: path.resolve(__dirname, "../../..") },
  outputFileTracingRoot: path.resolve(__dirname, "../../.."),
  outputFileTracingExcludes: {
    "/*": ["../../../be/.env*", "../../../be/md/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};
export default config;
