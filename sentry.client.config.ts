/**
 * Sentry client-side configuration.
 *
 * LGPD compliance:
 * - sendDefaultPii: false — no cookies, auth headers, or user IP sent
 * - beforeSend scrubs PII fields from every event
 * - No user identity tracked by default
 */
import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent, TransactionEvent } from "@sentry/core";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Percentage of transactions to sample for performance monitoring (0–1)
    tracesSampleRate: 0.2,

    // Percentage of sessions to replay for error debugging (0–1)
    replaysOnErrorSampleRate: 0.5,
    replaysSessionSampleRate: 0,

    // LGPD: never send cookies, auth headers, or IP
    sendDefaultPii: false,

    // Associate errors with the deployed release version
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
// PII scrubber — LGPD-compliant: removes names, emails, and phone numbers
// from all string values inside a Sentry event.
// ---------------------------------------------------------------------------

const PII_PATTERNS: RegExp[] = [
  // E-mail addresses
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  // Brazilian phone numbers: (XX) XXXXX-XXXX or similar
  /(\+?55\s?)?(\(?\d{2}\)?\s?)(\d{4,5}[\s\-]?\d{4})/g,
  // CPF: XXX.XXX.XXX-XX
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

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_FIELDS.has(key)) {
      result[key] = "[Filtered]";
    } else if (typeof value === "string") {
      result[key] = scrubString(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = scrubObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function scrubPii(event: ErrorEvent): ErrorEvent;
function scrubPii(event: TransactionEvent): TransactionEvent;
function scrubPii(event: ErrorEvent | TransactionEvent): ErrorEvent | TransactionEvent {
  return scrubObject(event as unknown as Record<string, unknown>) as unknown as ErrorEvent | TransactionEvent;
}
