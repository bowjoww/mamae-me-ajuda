import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { flashcardReviewRatelimit } from "@/lib/ratelimit";
import { reviewFlashcardSchema } from "@/lib/schemas/study";
import { enforceRateLimit, parseStrictJson, requireUser } from "@/lib/apiHelpers";
import { reviewCard } from "@/lib/services/flashcardService";
import {
  awardXp,
  classifyFlashcardXp,
} from "@/lib/services/gamificationService";

export async function POST(req: NextRequest) {
  try {
    const rl = await enforceRateLimit(req, flashcardReviewRatelimit);
    if (rl) return rl;

    const auth = await requireUser();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const parsed = await parseStrictJson(req, reviewFlashcardSchema);
    if (!parsed.ok) return parsed.res;

    // Ownership gate (RLS would deny otherwise, but surface a clean 404).
    const { data: existing } = await supabase
      .from("flashcards")
      .select("id, child_id")
      .eq("id", parsed.data.card_id)
      .eq("parent_id", user.id)
      .single();
    if (!existing) {
      return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });
    }

    const outcome = await reviewCard(supabase, {
      cardId: parsed.data.card_id,
      quality: parsed.data.quality,
    });
    if (outcome.error || !outcome.updated) {
      return NextResponse.json({ error: "Erro ao atualizar card." }, { status: 500 });
    }

    const correct = parsed.data.quality >= 3;
    const xp = classifyFlashcardXp(
      parsed.data.hints_used,
      correct,
      parsed.data.read_debrief
    );

    let awarded = 0;
    if (xp.delta > 0) {
      const { newTotal } = await awardXp(supabase, {
        childId: existing.child_id,
        delta: xp.delta,
        reason: xp.reason,
        context: {
          card_id: parsed.data.card_id,
          session_id: parsed.data.session_id ?? null,
          hints_used: parsed.data.hints_used,
        },
      });
      if (newTotal !== null) awarded = xp.delta;
    }

    return NextResponse.json({
      data: {
        card: outcome.updated,
        xp_awarded: awarded,
        xp_reason: xp.reason,
        next_sm2: outcome.nextSm2,
      },
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { endpoint: "flashcards-review" } });
    return NextResponse.json({ error: "Erro ao revisar card." }, { status: 500 });
  }
}
