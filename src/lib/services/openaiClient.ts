/**
 * Singleton OpenAI client with exponential-backoff retry.
 *
 * Usage:
 *   const client = getOpenAIClient();
 *   const response = await callWithRetry(() => client.responses.create({...}));
 *
 * The retry helper is transport-agnostic: pass any async function and it will
 * retry transient failures (5xx, ECONN*, ETIMEDOUT) with jittered exponential
 * backoff. 4xx errors are surfaced immediately — they will not be fixed by
 * retrying and we do not want to waste budget.
 */
import OpenAI from "openai";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 300;

let _client: OpenAI | null = null;

/**
 * Reset the cached client. Test-only helper.
 * @internal
 */
export function __resetOpenAIClient(): void {
  _client = null;
}

export function getOpenAIClient(): OpenAI {
  if (_client) return _client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  _client = new OpenAI({ apiKey });
  return _client;
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

interface ErrorWithStatus {
  status?: number;
  code?: string;
  message?: string;
}

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return true;
  const e = err as ErrorWithStatus;

  // 4xx (except 408/429) — not retryable.
  if (typeof e.status === "number") {
    if (e.status === 408 || e.status === 429) return true;
    if (e.status >= 400 && e.status < 500) return false;
    return true;
  }

  // Common transient network codes.
  const msg = `${e.code ?? ""} ${e.message ?? ""}`.toUpperCase();
  if (/ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ESOCKET/.test(msg)) return true;

  // Default to retry on unknown errors (safer for transient network blips).
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async call with jittered exponential backoff.
 * Returns on first success. Throws the last error after maxAttempts failures.
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxAttempts) {
        throw err;
      }
      const jitter = Math.random() * baseDelayMs;
      const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
      await sleep(delay);
    }
  }
  throw lastErr;
}
