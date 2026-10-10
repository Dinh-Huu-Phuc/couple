import type { NextConfig } from "next";
import path from "node:path";

const productionSecurityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000",
  },
] as const;

const config: NextConfig = {
  poweredByHeader: false,
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
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        },
        { key: "X-DNS-Prefetch-Control", value: "off" },
        { key: "Cache-Control", value: "private, no-store" },
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ...(process.env.NODE_ENV === "production"
          ? productionSecurityHeaders
          : []),
      ],
    }];
  },
};
export default config;
