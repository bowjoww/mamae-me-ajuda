import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
    return NextResponse.json({ error: "Dados de consentimento inválidos." }, { status: 400 });
  }

  // TODO: persist to database when Supabase auth is wired up
  // For now, the primary store is localStorage on the client.
  // The request body has been validated — this endpoint exists for audit readiness.

  return NextResponse.json({ ok: true }, { status: 201 });
}
