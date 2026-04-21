import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { studyPlansRatelimit } from "@/lib/ratelimit";
import {
  enforceRateLimit,
  parseStrictJson,
  requireUser,
} from "@/lib/apiHelpers";
import {
  createPlanFromIntent,
  parseStudentIntent,
} from "@/lib/services/studyPlanService";

/**
 * POST /api/study/plans/from-utterance
 *
 * Thin wrapper around the structured `POST /api/study/plans` endpoint that
 * takes a raw student utterance (free-form sentence like "Matemática quinta
 * 23/04 plano cartesiano e simetrias, AV2 discursiva 10 questões") and:
 *
 *   1. Parses it via `parseStudentIntent` (GPT-5.1 structured output)
 *   2. Persists the plan + subtopics via `createPlanFromIntent`
 *
 * This is the endpoint the /prova "Começar expedição" form hits — the form
 * only collects subject + date + topic, so the backend shoulders the intent
 * extraction instead of shipping a half-baked ParsedIntent from the client.
 */

const fromUtteranceSchema = z
  .object({
    child_id: z.string().uuid(),
    utterance: z.string().min(3).max(2000),
    student_name: z.string().min(1).max(100).optional(),
    exam_sample_photo_url: z.string().url().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    const rl = await enforceRateLimit(req, studyPlansRatelimit);
    if (rl) return rl;

    const auth = await requireUser();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const parsed = await parseStrictJson(req, fromUtteranceSchema);
    if (!parsed.ok) return parsed.res;

    // Ownership gate — match the pattern used by POST /api/study/plans so a
    // parent can't accidentally (or maliciously) create a plan for another
    // parent's child via a guessed UUID.
    const { data: child } = await supabase
      .from("children")
      .select("id, name")
      .eq("id", parsed.data.child_id)
      .eq("parent_id", user.id)
      .single();
    if (!child) {
      return NextResponse.json(
        { error: "Criança não encontrada." },
        { status: 404 }
      );
    }

    // Derive student name: caller-provided > DB row > generic fallback. The
    // AI uses this to keep the tone personal in generated debriefs.
    const studentName =
      parsed.data.student_name?.trim() || child.name || "estudante";

    const intent = await parseStudentIntent({
      studentName,
      studentUtterance: parsed.data.utterance,
      examSamplePhotoUrl: parsed.data.exam_sample_photo_url,
    });

    const result = await createPlanFromIntent(supabase, {
      parentId: user.id,
      childId: parsed.data.child_id,
      intent,
    });

    if (result.error || !result.plan) {
      Sentry.captureException(new Error(result.error ?? "plan_create_failed"), {
        tags: { endpoint: "study-plans-from-utterance", op: "create" },
      });
      return NextResponse.json(
        { error: "Não consegui criar a expedição." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: { plan: result.plan, topics: result.topics, intent } },
      { status: 201 }
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: { endpoint: "study-plans-from-utterance" },
    });
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
