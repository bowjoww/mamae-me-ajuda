/**
 * Sentry edge runtime configuration (middleware, edge API routes).
 *
 * The edge runtime has a limited API surface — keep this config minimal.
 * LGPD: sendDefaultPii disabled, no user data forwarded.
 */
import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    tracesSampleRate: 0.2,

    sendDefaultPii: false,

    release: process.env.NEXT_PUBLIC_APP_VERSION,

    environment: process.env.NODE_ENV,
  });
}
