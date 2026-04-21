import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authRatelimit, getClientIp } from "@/lib/ratelimit";

const signupSchema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres.")
    .max(128),
});

export async function POST(req: NextRequest) {
  if (authRatelimit) {
    const ip = getClientIp(req);
    const { success } = await authRatelimit.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: "Muitas tentativas. Tente novamente em breve." },
        { status: 429 }
      );
    }
  }

  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    // Never expose Supabase internal error details to the client
    return NextResponse.json(
      { error: "Não foi possível criar a conta. Tente novamente." },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { user: { id: data.user?.id, email: data.user?.email } },
    { status: 201 }
  );
}
