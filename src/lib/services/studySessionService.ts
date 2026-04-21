/**
 * Study session lifecycle + engagement score.
 *
 * Engagement score: 1 - (hints_used_total / max(hints_available_total, 1)).
 * Clamped to [0, 1]. Informs MMR (25% weight) and focus_session XP eligibility.
 * Speed is NEVER an input — duration is only used to detect a 15-minute
 * focus threshold.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudyMode, StudySession } from "@/lib/supabase/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DBClient = SupabaseClient<any>;

export const FOCUS_SESSION_MIN_MINUTES = 15;

export interface SessionEndInputs {
  questionsAsked: number;
  cardsReviewed: number;
  cardsCorrect: number;
  hintsUsedTotal: number;
  hintsAvailableTotal: number;
  masteryDelta?: Record<string, number>;
}

export function computeEngagementScore(hintsUsed: number, hintsAvailable: number): number {
  const avail = Math.max(1, hintsAvailable);
  const raw = 1 - hintsUsed / avail;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

export function isFocusSession(startedAt: Date, endedAt: Date): boolean {
  const deltaMin = (endedAt.getTime() - startedAt.getTime()) / 60000;
  return deltaMin >= FOCUS_SESSION_MIN_MINUTES;
}

export async function startSession(
  supabase: DBClient,
  params: { parentId: string; childId: string; mode: StudyMode; planId?: string }
): Promise<{ session: StudySession | null; error: string | null }> {
  const { data, error } = await supabase
    .from("study_sessions")
    .insert({
      parent_id: params.parentId,
      child_id: params.childId,
      mode: params.mode,
      plan_id: params.planId ?? null,
    })
    .select()
    .single();
  if (error || !data) return { session: null, error: error?.message ?? "session_insert_failed" };
  return { session: data, error: null };
}

export async function endSession(
  supabase: DBClient,
  params: {
    sessionId: string;
    inputs: SessionEndInputs;
    now?: Date;
  }
): Promise<{ session: StudySession | null; error: string | null; focusQualified: boolean }> {
  const endedAt = params.now ?? new Date();
  const engagement = computeEngagementScore(
    params.inputs.hintsUsedTotal,
    params.inputs.hintsAvailableTotal
  );

  // Read to compute focus eligibility from the known start time.
  const { data: existing, error: readErr } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("id", params.sessionId)
    .single();

  if (readErr || !existing) {
    return { session: null, error: readErr?.message ?? "session_not_found", focusQualified: false };
  }

  const focusQualified = isFocusSession(new Date(existing.started_at), endedAt);

  const { data, error } = await supabase
    .from("study_sessions")
    .update({
      ended_at: endedAt.toISOString(),
      questions_asked: params.inputs.questionsAsked,
      cards_reviewed: params.inputs.cardsReviewed,
      cards_correct: params.inputs.cardsCorrect,
      socratic_engagement_score: engagement,
      mastery_delta: (params.inputs.masteryDelta ?? {}) as Record<string, number>,
    })
    .eq("id", params.sessionId)
    .select()
    .single();

  if (error || !data) {
    return {
      session: null,
      error: error?.message ?? "session_update_failed",
      focusQualified,
    };
  }

  return { session: data, error: null, focusQualified };
}
