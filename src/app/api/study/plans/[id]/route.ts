import { NextRequest, NextResponse } from "next/server";
import { updateStudyPlanSchema } from "@/lib/schemas/study";
import { parseStrictJson, requireUser } from "@/lib/apiHelpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const { data: plan } = await supabase
    .from("study_plans")
    .select("*")
    .eq("id", id)
    .eq("parent_id", user.id)
    .single();
  if (!plan) {
    return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  }

  const { data: topics } = await supabase
    .from("study_topics")
    .select("*")
    .eq("plan_id", id)
    .order("order", { ascending: true });

  return NextResponse.json({ data: { plan, topics: topics ?? [] } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const parsed = await parseStrictJson(req, updateStudyPlanSchema);
  if (!parsed.ok) return parsed.res;

  const { data, error } = await supabase
    .from("study_plans")
    .update(parsed.data)
    .eq("id", id)
    .eq("parent_id", user.id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const { error } = await supabase
    .from("study_plans")
    .delete()
    .eq("id", id)
    .eq("parent_id", user.id);
  if (error) {
    return NextResponse.json({ error: "Erro ao excluir plano." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
