import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { studySessionsRatelimit } from "@/lib/ratelimit";
import { startSessionSchema } from "@/lib/schemas/study";
import { enforceRateLimit, parseStrictJson, requireUser } from "@/lib/apiHelpers";
import { startSession } from "@/lib/services/studySessionService";

export async function POST(req: NextRequest) {
  try {
    const rl = await enforceRateLimit(req, studySessionsRatelimit);
    if (rl) return rl;

    const auth = await requireUser();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const parsed = await parseStrictJson(req, startSessionSchema);
    if (!parsed.ok) return parsed.res;

    const { data: child } = await supabase
      .from("children")
      .select("id")
      .eq("id", parsed.data.child_id)
      .eq("parent_id", user.id)
      .single();
    if (!child) {
      return NextResponse.json({ error: "Criança não encontrada." }, { status: 404 });
    }

    const { session, error } = await startSession(supabase, {
      parentId: user.id,
      childId: parsed.data.child_id,
      mode: parsed.data.mode,
      planId: parsed.data.plan_id,
    });
    if (error || !session) {
      return NextResponse.json({ error: "Erro ao iniciar sessão." }, { status: 500 });
    }
    return NextResponse.json({ data: session }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error, { tags: { endpoint: "study-sessions" } });
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
