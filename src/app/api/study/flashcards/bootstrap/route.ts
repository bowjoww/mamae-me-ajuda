import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { flashcardGenerateRatelimit } from "@/lib/ratelimit";
import { enforceRateLimit, parseStrictJson, requireUser } from "@/lib/apiHelpers";
import {
  generateCardsForTopic,
  persistGeneratedCards,
} from "@/lib/services/flashcardService";
import type { Flashcard } from "@/lib/gamification/types";

/**
 * POST /api/study/flashcards/bootstrap
 *
 * Called when the user taps "Começar coleta" for the first time after
 * creating a plan. Flashcards are generated lazily (not at plan-creation
 * time) because generating N×M cards via GPT-5.1 would add 30-60s to the
 * /prova submit flow. Instead, the first time a student actually sits
 * down to study, we bootstrap a batch of 5 cards for whichever plan
 * topic has zero cards yet.
 *
 * Flow:
 *   1. Caller passes `plan_id` + `child_id`.
 *   2. We find the first study_topic under that plan with no flashcards.
 *   3. generateCardsForTopic → persistGeneratedCards (5 cards).
 *   4. Return the persisted cards in client `Flashcard` shape.
 *
 * If every topic already has cards, returns `{ data: [] }` and the caller
 * should fall back to `/api/study/flashcards/next` for spaced-repetition
 * picks. If no topics exist at all (plan is empty), returns 404 so the
 * UI can tell the user to re-create the expedição.
 */

const bootstrapSchema = z
  .object({
    child_id: z.string().uuid(),
    plan_id: z.string().uuid(),
    count: z.number().int().min(1).max(10).default(5),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    const rl = await enforceRateLimit(req, flashcardGenerateRatelimit);
    if (rl) return rl;

    const auth = await requireUser();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const parsed = await parseStrictJson(req, bootstrapSchema);
    if (!parsed.ok) return parsed.res;

    // Ownership gate (plan → parent).
    const { data: plan } = await supabase
      .from("study_plans")
      .select("id, subject, metadata, child_id")
      .eq("id", parsed.data.plan_id)
      .eq("parent_id", user.id)
      .eq("child_id", parsed.data.child_id)
      .single();
    if (!plan) {
      return NextResponse.json(
        { error: "Expedição não encontrada." },
        { status: 404 }
      );
    }

    const { data: topics } = await supabase
      .from("study_topics")
      .select("id, title")
      .eq("plan_id", parsed.data.plan_id);

    if (!topics || topics.length === 0) {
      return NextResponse.json(
        { error: "Expedição sem trechos." },
        { status: 404 }
      );
    }

    // Find the first topic without any flashcards.
    let targetTopic: { id: string; title: string } | null = null;
    for (const topic of topics) {
      const { count } = await supabase
        .from("flashcards")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", topic.id);
      if (!count || count === 0) {
        targetTopic = topic as { id: string; title: string };
        break;
      }
    }

    // Every topic already has cards — nothing to bootstrap.
    if (!targetTopic) {
      return NextResponse.json({ data: [] });
    }

    const { data: studentRow } = await supabase
      .from("children")
      .select("name")
      .eq("id", plan.child_id)
      .single();
    const studentName = studentRow?.name ?? "estudante";

    const metaFormat = (plan.metadata as { exam_format?: unknown } | null)
      ?.exam_format;
    const examFormat: "discursive" | "multiple-choice" | "mixed" =
      metaFormat === "multiple-choice" || metaFormat === "mixed"
        ? metaFormat
        : "discursive";

    const generated = await generateCardsForTopic({
      studentName,
      subject: plan.subject as string,
      topicTitle: targetTopic.title,
      count: parsed.data.count,
      examFormat,
    });

    const cards = await persistGeneratedCards(supabase, {
      parentId: user.id,
      childId: plan.child_id,
      topicId: targetTopic.id,
      cards: generated,
    });

    // Map persisted cards to the client `Flashcard` shape. Client consumes
    // `{ id, subject, topic, front, back }` — strip the server-only fields
    // (sm2_state, hint_chain, etc.) so the JSON payload stays small.
    const targetTitle = targetTopic.title;
    const clientCards: Flashcard[] = cards.map((c) => {
      const row = c as unknown as {
        id: string;
        question: string;
        answer_explanation: string;
        hint_chain: unknown;
      };
      // hint_chain is stored as jsonb. Accept both shapes:
      //   - string[] (what generateCardsForTopic emits)
      //   - [{ text: string }] (older experimental shape — keep reading it
      //     so we don't lose rows if a migration drifted)
      const rawHints = Array.isArray(row.hint_chain) ? row.hint_chain : [];
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
      return {
        id: row.id,
        subject: plan.subject as Flashcard["subject"],
        topic: targetTitle,
        front: row.question,
        back: row.answer_explanation,
        hintChain: hintChain.length > 0 ? hintChain : undefined,
      };
    });

    return NextResponse.json({ data: clientCards }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error, { tags: { endpoint: "flashcards-bootstrap" } });
    return NextResponse.json(
      { error: "Erro ao preparar coleta." },
      { status: 500 }
    );
  }
}
