import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const createConversationSchema = z.object({
  child_id: z.string().uuid("child_id inválido."),
  title: z.string().min(1).max(200).optional(),
});

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const childId = searchParams.get("child_id");

  let query = supabase
    .from("conversations")
    .select("*")
    .eq("parent_id", user.id)
    .order("updated_at", { ascending: false });

  if (childId) {
    query = query.eq("child_id", childId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Erro ao buscar conversas." }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createConversationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  // Verify child belongs to this parent
  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", parsed.data.child_id)
    .eq("parent_id", user.id)
    .single();

  if (!child) {
    return NextResponse.json({ error: "Criança não encontrada." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      child_id: parsed.data.child_id,
      parent_id: user.id,
      title: parsed.data.title ?? "Nova conversa",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Erro ao criar conversa." }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
