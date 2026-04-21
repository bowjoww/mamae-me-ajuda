import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { studyPlansRatelimit } from "@/lib/ratelimit";
import { createStudyPlanSchema } from "@/lib/schemas/study";
import {
  enforceRateLimit,
  parseStrictJson,
  requireUser,
} from "@/lib/apiHelpers";
import { createPlanFromIntent } from "@/lib/services/studyPlanService";

export async function GET(req: NextRequest) {
  // Rate limit reads too — a noisy client polling this endpoint can still
  // cost us Supabase egress and crowd out real traffic.
  const rl = await enforceRateLimit(req, studyPlansRatelimit);
  if (rl) return rl;

  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("study_plans")
    .select("*")
    .eq("parent_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Erro ao buscar planos." }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  try {
    const rl = await enforceRateLimit(req, studyPlansRatelimit);
    if (rl) return rl;

    const auth = await requireUser();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const parsed = await parseStrictJson(req, createStudyPlanSchema);
    if (!parsed.ok) return parsed.res;

    // Verify child belongs to the parent (RLS would block this insert anyway,
    // but a clean 404 is more useful than a 500 on RLS denial).
    const { data: child } = await supabase
      .from("children")
      .select("id")
      .eq("id", parsed.data.child_id)
      .eq("parent_id", user.id)
      .single();
    if (!child) {
      return NextResponse.json({ error: "Criança não encontrada." }, { status: 404 });
    }

    const result = await createPlanFromIntent(supabase, {
      parentId: user.id,
      childId: parsed.data.child_id,
      intent: parsed.data.intent,
    });

    if (result.error || !result.plan) {
      return NextResponse.json(
        { error: "Erro ao criar plano." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: { plan: result.plan, topics: result.topics } },
      { status: 201 }
    );
  } catch (error) {
    Sentry.captureException(error, { tags: { endpoint: "study-plans" } });
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
