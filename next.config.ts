import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// CSP is set dynamically per-request in src/proxy.ts using a per-request
// nonce, which removes the need for unsafe-eval and unsafe-inline.
// Only static, non-CSP security headers live here.
const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry org/project (populated at build time via SENTRY_ORG / SENTRY_PROJECT env vars)
  silent: !process.env.CI,

  // Upload source maps only in CI/production to avoid leaking them locally
  sourcemaps: {
    disable: process.env.NODE_ENV !== "production",
  },

  // Tunnel Sentry requests through /api/_sentry to avoid ad-blocker interference
  tunnelRoute: "/api/_sentry",
});
