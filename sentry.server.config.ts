/**
 * Sentry server-side configuration (Node.js runtime).
 *
 * LGPD compliance:
 * - sendDefaultPii: false — no cookies, auth headers, or user IP sent
 * - beforeSend scrubs PII fields from every event
 */
import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    tracesSampleRate: 0.2,

    // LGPD: never send cookies, auth headers, or IP
    sendDefaultPii: false,

    release: process.env.NEXT_PUBLIC_APP_VERSION,

    environment: process.env.NODE_ENV,

    beforeSend(event) {
      return scrubPii(event);
    },

    beforeSendTransaction(event) {
      return scrubPii(event);
    },
  });
}

// ---------------------------------------------------------------------------
// PII scrubber (mirrors client config)
// ---------------------------------------------------------------------------

const PII_PATTERNS: RegExp[] = [
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  /(\+?55\s?)?(\(?\d{2}\)?\s?)(\d{4,5}[\s\-]?\d{4})/g,
  /\d{3}\.?\d{3}\.?\d{3}[\-]?\d{2}/g,
];

const PII_FIELDS = new Set(["studentName", "student_name", "name", "email", "phone", "cpf"]);

function scrubString(value: string): string {
  let result = value;
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern, "[Filtered]");
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scrubObject(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_FIELDS.has(key)) {
      result[key] = "[Filtered]";
    } else if (typeof value === "string") {
      result[key] = scrubString(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = scrubObject(value as Record<string, any>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scrubPii<T extends Record<string, any>>(event: T): T {
  return scrubObject(event) as T;
}
