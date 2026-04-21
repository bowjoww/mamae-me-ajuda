import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { flashcardGenerateRatelimit } from "@/lib/ratelimit";
import { generateFlashcardsSchema } from "@/lib/schemas/study";
import { enforceRateLimit, parseStrictJson, requireUser } from "@/lib/apiHelpers";
import {
  generateCardsForTopic,
  persistGeneratedCards,
} from "@/lib/services/flashcardService";

export async function POST(req: NextRequest) {
  try {
    const rl = await enforceRateLimit(req, flashcardGenerateRatelimit);
    if (rl) return rl;

    const auth = await requireUser();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const parsed = await parseStrictJson(req, generateFlashcardsSchema);
    if (!parsed.ok) return parsed.res;

    // Join topic -> plan -> child+parent, enforced by RLS.
    const { data: topic } = await supabase
      .from("study_topics")
      .select(
        "id, title, plan_id, study_plans!inner(id, subject, child_id, parent_id, metadata)"
      )
      .eq("id", parsed.data.topic_id)
      .single();

    if (!topic) {
      return NextResponse.json({ error: "Tópico não encontrado." }, { status: 404 });
    }
    const plan = (
      topic as unknown as {
        study_plans: {
          child_id: string;
          subject: string;
          parent_id: string;
          metadata?: Record<string, unknown> | null;
        };
      }
    ).study_plans;
    if (!plan || plan.parent_id !== user.id) {
      return NextResponse.json({ error: "Tópico não encontrado." }, { status: 404 });
    }

    const studentNameRow = await supabase
      .from("children")
      .select("name")
      .eq("id", plan.child_id)
      .single();
    const studentName = studentNameRow.data?.name ?? "estudante";

    // Extract exam_format from plan metadata if the plan was created with one.
    // Discursive is the default because the reference school (Impacto / AV2)
    // uses open-ended questions — safer to err on the side of "write it out".
    const metaFormat = (plan.metadata as { exam_format?: unknown } | null)?.exam_format;
    const examFormat: "discursive" | "multiple-choice" | "mixed" =
      metaFormat === "multiple-choice" || metaFormat === "mixed"
        ? metaFormat
        : "discursive";

    const generated = await generateCardsForTopic({
      studentName,
      subject: plan.subject,
      topicTitle: (topic as { title: string }).title,
      count: parsed.data.count,
      examFormat,
    });

    const cards = await persistGeneratedCards(supabase, {
      parentId: user.id,
      childId: plan.child_id,
      topicId: parsed.data.topic_id,
      cards: generated,
    });

    return NextResponse.json({ data: cards }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error, { tags: { endpoint: "flashcards-generate" } });
    return NextResponse.json({ error: "Erro ao gerar flashcards." }, { status: 500 });
  }
}
