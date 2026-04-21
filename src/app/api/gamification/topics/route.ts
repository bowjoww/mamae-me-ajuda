import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { gamificationRatelimit } from "@/lib/ratelimit";
import { enforceRateLimit, requireUser } from "@/lib/apiHelpers";

/**
 * GET /api/gamification/topics?child_id=...
 *
 * Aggregates the child's `study_topics` (joined through `study_plans` to
 * carry the subject label) and maps `mastery_score` to the three-state UI
 * vocabulary the /estudo page consumes: "new" | "progress" | "mastered".
 *
 * Thresholds are intentionally coarse — the underlying SM-2 mastery_score
 * is a continuous float in [0, 1], and we collapse it to bands that the
 * player can reason about without reading a number.
 */

const NORMALIZED_SUBJECT = new Set([
  "matematica",
  "portugues",
  "ciencias",
  "historia",
  "geografia",
  "ingles",
]);

function normalizeSubject(raw: string): string {
  // Strip accents and lowercase so server-stored "Matemática" lines up with
  // the client-side SUBJECT union in gamification/types.ts.
  const slug = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return NORMALIZED_SUBJECT.has(slug) ? slug : "matematica";
}

function masteryBand(score: number): "new" | "progress" | "mastered" {
  if (score >= 0.75) return "mastered";
  if (score >= 0.25) return "progress";
  return "new";
}

interface TopicJoinRow {
  title: string;
  mastery_score: number;
  last_reviewed_at: string | null;
  study_plans: { subject: string } | { subject: string }[] | null;
}

export async function GET(req: NextRequest) {
  try {
    const rl = await enforceRateLimit(req, gamificationRatelimit);
    if (rl) return rl;

    const auth = await requireUser();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const { searchParams } = new URL(req.url);
    const childIdParam = searchParams.get("child_id");
    if (!childIdParam || !z.string().uuid().safeParse(childIdParam).success) {
      return NextResponse.json({ error: "child_id inválido." }, { status: 400 });
    }

    // Ownership gate — prevents a parent A from snooping on parent B's child
    // via a guessed UUID. RLS would already block data reads, but an explicit
    // 404 is more honest than an empty list.
    const { data: child } = await supabase
      .from("children")
      .select("id")
      .eq("id", childIdParam)
      .eq("parent_id", user.id)
      .single();
    if (!child) {
      return NextResponse.json({ error: "Criança não encontrada." }, { status: 404 });
    }

    // Join topics to plans so we can ship the subject label alongside each
    // row. RLS limits to parent_id = auth.uid() automatically.
    const { data: rows, error } = await supabase
      .from("study_topics")
      .select("title, mastery_score, last_reviewed_at, study_plans!inner(subject, child_id)")
      .eq("parent_id", user.id)
      .eq("study_plans.child_id", childIdParam)
      .order("last_reviewed_at", { ascending: false, nullsFirst: false })
      .limit(50);

    if (error) {
      Sentry.captureException(error, {
        tags: { endpoint: "gamification-topics", op: "select" },
      });
      return NextResponse.json(
        { error: "Erro ao buscar tópicos." },
        { status: 500 }
      );
    }

    const typedRows = (rows ?? []) as TopicJoinRow[];
    const data = typedRows.map((r) => {
      const joined = Array.isArray(r.study_plans)
        ? r.study_plans[0]
        : r.study_plans;
      const subjectRaw = joined?.subject ?? "matematica";
      return {
        topic: r.title,
        subject: normalizeSubject(subjectRaw),
        mastery: masteryBand(Number(r.mastery_score ?? 0)),
        lastStudiedIso: r.last_reviewed_at ?? null,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { endpoint: "gamification-topics" },
    });
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
