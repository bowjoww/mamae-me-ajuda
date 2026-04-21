import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { flashcardNextRatelimit } from "@/lib/ratelimit";
import { nextFlashcardSchema } from "@/lib/schemas/study";
import { enforceRateLimit, parseStrictJson, requireUser } from "@/lib/apiHelpers";
import { pickNextCard } from "@/lib/services/flashcardService";

export async function POST(req: NextRequest) {
  try {
    const rl = await enforceRateLimit(req, flashcardNextRatelimit);
    if (rl) return rl;

    const auth = await requireUser();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const parsed = await parseStrictJson(req, nextFlashcardSchema);
    if (!parsed.ok) return parsed.res;

    // Ownership check via the children RLS layer.
    const { data: child } = await supabase
      .from("children")
      .select("id")
      .eq("id", parsed.data.child_id)
      .eq("parent_id", user.id)
      .single();
    if (!child) {
      return NextResponse.json({ error: "Criança não encontrada." }, { status: 404 });
    }

    const next = await pickNextCard(supabase, {
      childId: parsed.data.child_id,
      planId: parsed.data.plan_id,
    });

    return NextResponse.json({ data: next ?? null });
  } catch (error) {
    Sentry.captureException(error, { tags: { endpoint: "flashcards-next" } });
    return NextResponse.json({ error: "Erro ao buscar próximo card." }, { status: 500 });
  }
}
