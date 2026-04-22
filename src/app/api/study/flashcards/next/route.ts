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

    if (!next) {
      return NextResponse.json({ data: null });
    }

    // Enrich the raw DB row into the client Flashcard shape so the UI can
    // consume it directly. Without this, FlashcardDuel blows up on
    // `card.topic.length` (topic is not a column on flashcards — it lives
    // on study_topics; the row only carries topic_id).
    const raw = next as unknown as {
      id: string;
      topic_id: string;
      question: string;
      answer_explanation: string;
      hint_chain: unknown;
    };

    // Look up the topic title + the parent plan's subject. Two queries
    // keeps the join simple against Supabase's typed builder; both rows
    // are small (one record each).
    const { data: topicRow } = await supabase
      .from("study_topics")
      .select("title, study_plans!inner(subject)")
      .eq("id", raw.topic_id)
      .single();

    const topicTitle =
      (topicRow as { title?: string } | null)?.title ?? "";
    // study_plans!inner returns the plan as either an object or a single-
    // element array depending on the generator's view of cardinality.
    const planRow =
      (topicRow as unknown as { study_plans?: { subject?: string } | { subject?: string }[] } | null)
        ?.study_plans;
    const subjectRaw =
      (Array.isArray(planRow) ? planRow[0]?.subject : planRow?.subject) ?? "matematica";

    const allowedSubjects = new Set([
      "matematica",
      "portugues",
      "ciencias",
      "historia",
      "geografia",
      "ingles",
    ]);
    const subject = allowedSubjects.has(subjectRaw.toLowerCase())
      ? (subjectRaw.toLowerCase() as
          | "matematica"
          | "portugues"
          | "ciencias"
          | "historia"
          | "geografia"
          | "ingles")
      : "matematica";

    // hint_chain is jsonb — accept both string[] and [{text}] shapes for
    // forward/backward compat with migration drift.
    const rawHints = Array.isArray(raw.hint_chain) ? raw.hint_chain : [];
    const hintChain: string[] = rawHints
      .map((h) => {
        if (typeof h === "string") return h;
        if (h && typeof h === "object" && "text" in h) {
          const t = (h as { text?: unknown }).text;
          return typeof t === "string" ? t : "";
        }
        return "";
      })
      .filter((h): h is string => h.length > 0);

    const clientCard = {
      id: raw.id,
      subject,
      topic: topicTitle,
      front: raw.question,
      back: raw.answer_explanation,
      hintChain: hintChain.length > 0 ? hintChain : undefined,
    };

    return NextResponse.json({ data: clientCard });
  } catch (error) {
    Sentry.captureException(error, { tags: { endpoint: "flashcards-next" } });
    return NextResponse.json({ error: "Erro ao buscar próximo card." }, { status: 500 });
  }
}
