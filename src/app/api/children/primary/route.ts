import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/apiHelpers";

/**
 * Resolve the primary child for the authenticated parent.
 *
 * GET /api/children/primary?name=Henrique
 *   - If the parent already has at least one child, returns the oldest one.
 *   - Otherwise, lazily provisions a `children` row using the provided name
 *     (defaults to "estudante") so the rest of the study/gamification stack
 *     has a valid child_id to hang data off of.
 *
 * This keeps the onboarding flow shallow: a freshly-signed-up parent who
 * types a name on WelcomeScreen gets the backend entity without having to
 * touch a separate "add child" screen. The richer multi-child UI can override
 * the primary later — this endpoint never demotes an existing child.
 */

const querySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  grade: z.string().trim().min(1).max(50).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const { searchParams } = new URL(req.url);
    const parsedQuery = querySchema.safeParse({
      name: searchParams.get("name") ?? undefined,
      grade: searchParams.get("grade") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Parâmetros inválidos." },
        { status: 400 }
      );
    }

    // Return the oldest child when one already exists. We pick oldest instead
    // of newest because the onboarding assumption is that the first entity
    // created is the "real" student; newer rows are likely siblings added
    // later via a (future) multi-child UI.
    const { data: existing, error: fetchError } = await supabase
      .from("children")
      .select("*")
      .eq("parent_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (fetchError) {
      Sentry.captureException(fetchError, {
        tags: { endpoint: "children-primary", op: "select" },
      });
      return NextResponse.json(
        { error: "Erro ao buscar criança." },
        { status: 500 }
      );
    }

    if (existing && existing.length > 0) {
      return NextResponse.json({ data: existing[0] });
    }

    // No child yet — lazily provision. We default grade to "nao_informado"
    // when the caller didn't pass one; the value is a string anyway and
    // onboarding may refine it later.
    const insertName = parsedQuery.data.name ?? "estudante";
    const insertGrade = parsedQuery.data.grade ?? "nao_informado";

    const { data: created, error: insertError } = await supabase
      .from("children")
      .insert({
        parent_id: user.id,
        name: insertName,
        grade: insertGrade,
        subjects: [],
      })
      .select()
      .single();

    if (insertError || !created) {
      Sentry.captureException(insertError ?? new Error("insert_empty"), {
        tags: { endpoint: "children-primary", op: "insert" },
      });
      return NextResponse.json(
        { error: "Erro ao criar criança." },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { endpoint: "children-primary" },
    });
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
