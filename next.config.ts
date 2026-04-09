import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      // Allow connections to AI APIs, Sentry, and PostHog
      "connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com https://*.ingest.sentry.io https://app.posthog.com https://eu.posthog.com",
      "font-src 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
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
