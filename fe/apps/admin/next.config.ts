import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  transpilePackages: ["@couple/domain"],
  turbopack: { root: path.resolve(__dirname, "../../..") },
  outputFileTracingRoot: path.resolve(__dirname, "../../.."),
  outputFileTracingExcludes: {
    "/*": ["../../../be/.env*", "../../../be/md/**/*"],
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Cache-Control", value: "private, no-store" },
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      ],
    }];
  },
};
export default config;
