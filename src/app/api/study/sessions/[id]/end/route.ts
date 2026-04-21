import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { studySessionsRatelimit } from "@/lib/ratelimit";
import { endSessionSchema } from "@/lib/schemas/study";
import { enforceRateLimit, parseStrictJson, requireUser } from "@/lib/apiHelpers";
import { endSession } from "@/lib/services/studySessionService";
import { awardXp, XP_TABLE } from "@/lib/services/gamificationService";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: sessionId } = await params;

    const rl = await enforceRateLimit(req, studySessionsRatelimit);
    if (rl) return rl;

    const auth = await requireUser();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const parsed = await parseStrictJson(req, endSessionSchema);
    if (!parsed.ok) return parsed.res;

    // Verify the session belongs to this parent up front.
    const { data: existing } = await supabase
      .from("study_sessions")
      .select("child_id")
      .eq("id", sessionId)
      .eq("parent_id", user.id)
      .single();
    if (!existing) {
      return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
    }

    const { session, error, focusQualified } = await endSession(supabase, {
      sessionId,
      inputs: {
        questionsAsked: parsed.data.questions_asked,
        cardsReviewed: parsed.data.cards_reviewed,
        cardsCorrect: parsed.data.cards_correct,
        hintsUsedTotal: parsed.data.hints_used_total,
        hintsAvailableTotal: parsed.data.hints_available_total,
        masteryDelta: parsed.data.mastery_delta,
      },
    });

    if (error || !session) {
      return NextResponse.json({ error: "Erro ao encerrar sessão." }, { status: 500 });
    }

    let xpAwarded = 0;
    if (focusQualified) {
      const { newTotal } = await awardXp(supabase, {
        childId: existing.child_id,
        delta: XP_TABLE.focus_session,
        reason: "focus_session",
        context: { session_id: sessionId },
      });
      if (newTotal !== null) xpAwarded = XP_TABLE.focus_session;
    }

    return NextResponse.json({
      data: { session, xp_awarded: xpAwarded, focus_qualified: focusQualified },
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { endpoint: "study-sessions-end" } });
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
