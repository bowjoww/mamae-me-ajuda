/**
 * Zod schemas for study-mode + gamification endpoints.
 * Every handler uses `.strict()` to reject unknown fields (CISO blocker).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const uuid = z.string().uuid();

export const studyModeSchema = z.enum(["prova", "estudo"]);
export const studyPlanStatusSchema = z.enum(["draft", "active", "completed", "archived"]);
export const difficultySchema = z.enum(["easy", "medium", "hard"]);

// ---------------------------------------------------------------------------
// Supabase Storage URL validation (SSRF / prompt-exfil defense).
//
// Background: study-plan creation accepts a photo of the exam reference that
// the vision-capable model will read. Earlier we used a bare `z.string().url()`
// which let an authenticated attacker send any URL — their own C2 server, a
// private intranet host, a Slack webhook, etc. Two concrete harms:
//
//   1. The model fetches the URL while building its prompt, leaking signals
//      about system prompts, context, or timing to the attacker.
//   2. SSRF-style probes against internal infra that happens to be reachable
//      from the AI provider's fetcher.
//
// Mitigation: accept ONLY URLs that point at our own Supabase Storage bucket.
// The hostname is derived from NEXT_PUBLIC_SUPABASE_URL at module load; the
// path must begin with /storage/v1/object/ (public OR signed OR authenticated
// object routes — all of which live under that prefix).
//
// The helper is exported for reuse by other schemas that accept storage URLs.
// ---------------------------------------------------------------------------

// Resolve once at module load. When unset (e.g. build-time parse) we fall
// back to a sentinel that can never match — callers will always fail closed.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_STORAGE_HOST = (() => {
  if (!SUPABASE_URL) return "";
  try {
    return new URL(SUPABASE_URL).hostname;
  } catch {
    return "";
  }
})();

export function isSupabaseStorageUrl(raw: string): boolean {
  if (!SUPABASE_STORAGE_HOST) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  // Strict protocol pin — no http:, no data:, no javascript:.
  if (parsed.protocol !== "https:") return false;
  if (parsed.hostname !== SUPABASE_STORAGE_HOST) return false;
  // Supabase Storage routes all live under /storage/v1/object/. This covers:
  //   /storage/v1/object/public/<bucket>/...
  //   /storage/v1/object/sign/<bucket>/...
  //   /storage/v1/object/authenticated/<bucket>/...
  if (!parsed.pathname.startsWith("/storage/v1/object/")) return false;
  return true;
}

/**
 * Strip query params + fragment from a Supabase Storage URL before persisting
 * or forwarding it. Signed URLs carry a `token` query that is sensitive (JWT
 * grant). We keep the storage path — that's the stable identifier the model
 * needs to resolve the image — and discard the transient credential.
 *
 * Returns the original input untouched on parse failure. Callers should have
 * already gone through `isSupabaseStorageUrl` before getting here.
 */
export function stripStorageUrlQuery(raw: string): string {
  try {
    const u = new URL(raw);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

const supabaseStorageUrlSchema = z
  .string()
  .url()
  .refine(isSupabaseStorageUrl, {
    message: "photo URL must be a Supabase Storage object URL",
  });

// ---------------------------------------------------------------------------
// Study plans
// ---------------------------------------------------------------------------

export const examFormatSchema = z.enum(["discursive", "multiple-choice", "mixed"]);

export const parsedIntentSchema = z
  .object({
    subject: z.string().min(1).max(80),
    topic: z.string().min(1).max(200),
    exam_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "exam_date must be YYYY-MM-DD")
      .optional(),
    exam_format: examFormatSchema.optional(),
    subtopics: z
      .array(
        z
          .object({
            title: z.string().min(1).max(200),
            estimated_minutes: z.number().int().min(5).max(600),
          })
          .strict()
      )
      .max(50)
      .default([]),
    // Accept only URLs that point at our own Supabase Storage bucket.
    // See isSupabaseStorageUrl above for rationale.
    exam_sample_photo_url: supabaseStorageUrlSchema.optional(),
  })
  .strict();

export const createStudyPlanSchema = z
  .object({
    child_id: uuid,
    intent: parsedIntentSchema,
  })
  .strict();

export const updateStudyPlanSchema = z
  .object({
    status: studyPlanStatusSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Study sessions
// ---------------------------------------------------------------------------

export const startSessionSchema = z
  .object({
    child_id: uuid,
    mode: studyModeSchema,
    plan_id: uuid.optional(),
  })
  .strict();

export const endSessionSchema = z
  .object({
    questions_asked: z.number().int().min(0).max(1000).default(0),
    cards_reviewed: z.number().int().min(0).max(1000).default(0),
    cards_correct: z.number().int().min(0).max(1000).default(0),
    hints_used_total: z.number().int().min(0).max(5000).default(0),
    hints_available_total: z.number().int().min(0).max(5000).default(0),
    mastery_delta: z.record(z.string(), z.number()).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Flashcards
// ---------------------------------------------------------------------------

export const generateFlashcardsSchema = z
  .object({
    topic_id: uuid,
    count: z.number().int().min(1).max(10).default(3),
  })
  .strict();

export const nextFlashcardSchema = z
  .object({
    child_id: uuid,
    mode: studyModeSchema,
    plan_id: uuid.optional(),
  })
  .strict();

export const reviewFlashcardSchema = z
  .object({
    card_id: uuid,
    // Socratic grading: 0 = errei, 3 = quase, 5 = acertei.
    quality: z.union([z.literal(0), z.literal(3), z.literal(5)]),
    hints_used: z.number().int().min(0).max(10),
    session_id: uuid.optional(),
    read_debrief: z.boolean().default(false),
  })
  .strict();

// ---------------------------------------------------------------------------
// Gamification
// ---------------------------------------------------------------------------

export const questAbandonSchema = z.object({}).strict();

export const powerUpUseSchema = z
  .object({
    child_id: uuid,
    target_card_id: uuid.optional(),
    session_id: uuid.optional(),
  })
  .strict();

// Inferred types
export type ParsedIntent = z.infer<typeof parsedIntentSchema>;
export type CreateStudyPlanInput = z.infer<typeof createStudyPlanSchema>;
export type UpdateStudyPlanInput = z.infer<typeof updateStudyPlanSchema>;
export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type EndSessionInput = z.infer<typeof endSessionSchema>;
export type GenerateFlashcardsInput = z.infer<typeof generateFlashcardsSchema>;
export type NextFlashcardInput = z.infer<typeof nextFlashcardSchema>;
export type ReviewFlashcardInput = z.infer<typeof reviewFlashcardSchema>;
export type PowerUpUseInput = z.infer<typeof powerUpUseSchema>;
