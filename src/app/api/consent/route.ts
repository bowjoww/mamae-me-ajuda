import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const consentSchema = z.object({
  accepted: z.literal(true),
  version: z.string().min(1),
  acceptedAt: z.string().datetime(),
  parentalConsent: z.literal(true),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = consentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados de consentimento inválidos." },
      { status: 400 }
    );
  }

  const { version, acceptedAt, parentalConsent } = parsed.data;

  const supabase = await createSupabaseServerClient();

  // Resolve the authenticated user if available (consent may precede signup)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("consent_records").insert({
    user_id: user?.id ?? null,
    accepted: true,
    version,
    accepted_at: acceptedAt,
    parental_consent: parentalConsent,
  });

  if (error) {
    // Log server-side but return generic error to client
    console.error("[consent] DB insert failed:", error.message);
    return NextResponse.json(
      { error: "Erro ao registrar consentimento." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
