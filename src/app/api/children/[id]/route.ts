import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const updateChildSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  grade: z.string().min(1).max(50).optional(),
  subjects: z.array(z.string().max(100)).max(20).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("children")
    .select("*")
    .eq("id", id)
    .eq("parent_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Criança não encontrada." }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateChildSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("children")
    .update(parsed.data)
    .eq("id", id)
    .eq("parent_id", user.id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Criança não encontrada." }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { error } = await supabase
    .from("children")
    .delete()
    .eq("id", id)
    .eq("parent_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Erro ao excluir criança." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
