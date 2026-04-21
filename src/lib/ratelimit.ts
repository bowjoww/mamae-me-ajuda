import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let chatRatelimit: Ratelimit | null = null;
let ttsRatelimit: Ratelimit | null = null;
let authRatelimit: Ratelimit | null = null;
let studyPlansRatelimit: Ratelimit | null = null;
let studySessionsRatelimit: Ratelimit | null = null;
let flashcardGenerateRatelimit: Ratelimit | null = null;
let flashcardNextRatelimit: Ratelimit | null = null;
let flashcardReviewRatelimit: Ratelimit | null = null;
let gamificationRatelimit: Ratelimit | null = null;
let accountExportRatelimit: Ratelimit | null = null;

if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  chatRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: "rl:chat",
  });

  ttsRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    prefix: "rl:tts",
  });

  // Auth endpoints: max 5 attempts per IP per minute to deter brute-force
  authRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    prefix: "rl:auth",
  });

  // Study / gamification buckets (CISO-defined limits)
  studyPlansRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    prefix: "rl:study-plans",
  });

  studySessionsRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "1 m"),
    prefix: "rl:study-sessions",
  });

  flashcardGenerateRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: "rl:fc-generate",
  });

  flashcardNextRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    prefix: "rl:fc-next",
  });

  flashcardReviewRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    prefix: "rl:fc-review",
  });

  gamificationRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    prefix: "rl:gamification",
  });

  // LGPD Art. 18 data export — expensive (multi-table scan) and rarely used.
  // 1 request per hour per IP is plenty for the legitimate use case and
  // deters scraping or timing-attack patterns.
  accountExportRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1, "1 h"),
    prefix: "rl:account-export",
  });
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "127.0.0.1";
}

export {
  chatRatelimit,
  ttsRatelimit,
  authRatelimit,
  studyPlansRatelimit,
  studySessionsRatelimit,
  flashcardGenerateRatelimit,
  flashcardNextRatelimit,
  flashcardReviewRatelimit,
  gamificationRatelimit,
  accountExportRatelimit,
};
