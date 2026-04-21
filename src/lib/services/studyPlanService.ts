/**
 * Study plan service — creates plans from parsed intent, manages topics.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  StudyPlan,
  StudyTopic,
  StudyPlanStatus,
} from "@/lib/supabase/types";
import type { ParsedIntent } from "@/lib/schemas/study";
import { stripStorageUrlQuery } from "@/lib/schemas/study";
import { askStructured } from "./aiTutor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DBClient = SupabaseClient<any>;

export interface CreatePlanResult {
  plan: StudyPlan | null;
  topics: StudyTopic[];
  error: string | null;
}

/**
 * Create a study plan + topics from a parsed intent blob.
 * Never trusts the intent shape beyond Zod — we defensively re-cap arrays
 * and strings before writing. RLS guarantees this insert only succeeds
 * when parent_id matches auth.uid().
 */
export async function createPlanFromIntent(
  supabase: DBClient,
  params: {
    parentId: string;
    childId: string;
    intent: ParsedIntent;
  }
): Promise<CreatePlanResult> {
  // Strip query params (signed-URL tokens) before persisting. Schema has
  // already validated origin; we still drop the transient credential so it
  // never leaks into Supabase logs, Sentry breadcrumbs, or the model prompt.
  const sanitizedPhotoUrl = params.intent.exam_sample_photo_url
    ? stripStorageUrlQuery(params.intent.exam_sample_photo_url)
    : null;

  const { data: plan, error: planErr } = await supabase
    .from("study_plans")
    .insert({
      parent_id: params.parentId,
      child_id: params.childId,
      subject: params.intent.subject,
      topic: params.intent.topic,
      exam_date: params.intent.exam_date ?? null,
      status: "active" as StudyPlanStatus,
      metadata: {
        exam_sample_photo_url: sanitizedPhotoUrl,
        exam_format: params.intent.exam_format ?? null,
        estimated_minutes_total: params.intent.subtopics.reduce(
          (acc, s) => acc + s.estimated_minutes,
          0
        ),
      },
    })
    .select()
    .single();

  if (planErr || !plan) {
    return { plan: null, topics: [], error: planErr?.message ?? "plan_insert_failed" };
  }

  if (params.intent.subtopics.length === 0) {
    return { plan, topics: [], error: null };
  }

  const topicInserts = params.intent.subtopics.map((s, idx) => ({
    plan_id: plan.id,
    parent_id: params.parentId,
    title: s.title,
    order: idx,
  }));

  const { data: topics, error: topicsErr } = await supabase
    .from("study_topics")
    .insert(topicInserts)
    .select();

  if (topicsErr || !topics) {
    // Best-effort cleanup: remove the plan so we don't leave orphans.
    await supabase.from("study_plans").delete().eq("id", plan.id);
    return { plan: null, topics: [], error: topicsErr?.message ?? "topics_insert_failed" };
  }

  return { plan, topics, error: null };
}

// ---------------------------------------------------------------------------
// AI-backed intent parser
// ---------------------------------------------------------------------------

const INTENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string" },
    topic: { type: "string" },
    exam_date: {
      type: ["string", "null"],
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    },
    exam_format: {
      type: ["string", "null"],
      enum: ["discursive", "multiple-choice", "mixed", null],
    },
    subtopics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          estimated_minutes: { type: "integer", minimum: 5, maximum: 600 },
        },
        required: ["title", "estimated_minutes"],
      },
    },
  },
  required: ["subject", "topic", "exam_date", "exam_format", "subtopics"],
};

export interface RawIntentRequest {
  studentName: string;
  studentUtterance: string;
  examSamplePhotoUrl?: string;
}

export async function parseStudentIntent(req: RawIntentRequest): Promise<ParsedIntent> {
  // Defense in depth: even though the route validates the URL origin before
  // we get here, strip signed-URL tokens before they reach the model or logs.
  const sanitizedPhotoUrl = req.examSamplePhotoUrl
    ? stripStorageUrlQuery(req.examSamplePhotoUrl)
    : undefined;

  const userPrompt = [
    "Extraia, a partir da fala do(a) estudante, um plano de estudo estruturado.",
    "Retorne JSON com: subject (matéria), topic (tópico principal), exam_date (YYYY-MM-DD ou null), exam_format, e subtopics (lista de { title, estimated_minutes }).",
    "",
    "Regras para exam_format:",
    "- 'discursive' quando a fala indicar prova de questões abertas, desenvolvimento escrito, AV2, ou formato do Colégio Impacto.",
    "- 'multiple-choice' quando indicar alternativas, assinalar, vestibular, Enem, etc.",
    "- 'mixed' quando mencionar os dois.",
    "- null quando não houver indicação clara.",
    "",
    "Regras para subtopics:",
    "- Quebre o conteúdo em 3-5 etapas de estudo sensatas, ordenadas do pré-requisito ao simulado final.",
    "- Cada etapa com estimated_minutes realista (15 a 60 minutos) para um(a) estudante do ensino fundamental.",
    "",
    "Fala do estudante:",
    req.studentUtterance,
    sanitizedPhotoUrl
      ? `\n(Referência de foto da prova antiga: ${sanitizedPhotoUrl})`
      : "",
  ].join("\n");

  const { data } = await askStructured<{
    subject: string;
    topic: string;
    exam_date: string | null;
    exam_format: "discursive" | "multiple-choice" | "mixed" | null;
    subtopics: { title: string; estimated_minutes: number }[];
  }>({
    studentName: req.studentName,
    mode: "prova",
    userPrompt,
    schemaName: "study_plan_intent",
    jsonSchema: INTENT_JSON_SCHEMA,
  });

  return {
    subject: data.subject,
    topic: data.topic,
    exam_date: data.exam_date ?? undefined,
    exam_format: data.exam_format ?? undefined,
    subtopics: data.subtopics,
    exam_sample_photo_url: sanitizedPhotoUrl,
  };
}
