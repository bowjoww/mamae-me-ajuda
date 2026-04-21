/**
 * Small helpers for Next.js route handlers in the study / gamification stack.
 * Keeps auth + rate-limit + Zod plumbing out of each individual file.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Ratelimit } from "@upstash/ratelimit";
import type { ZodType } from "zod";
import { getClientIp } from "./ratelimit";
import { createSupabaseServerClient } from "./supabase/server";

export async function requireUser(): Promise<
  | {
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      user: { id: string };
      error: null;
    }
  | { supabase: null; user: null; error: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      supabase: null,
      user: null,
      error: NextResponse.json({ error: "Não autorizado." }, { status: 401 }),
    };
  }
  return { supabase, user, error: null };
}

export async function enforceRateLimit(
  req: NextRequest,
  limiter: Ratelimit | null,
  message = "Muitas requisições. Aguarde um momento."
): Promise<NextResponse | null> {
  if (!limiter) return null;
  const ip = getClientIp(req);
  const { success } = await limiter.limit(ip);
  if (!success) {
    return NextResponse.json({ error: message }, { status: 429 });
  }
  return null;
}

export async function parseStrictJson<T>(
  req: NextRequest,
  schema: ZodType<T>
): Promise<
  | { ok: true; data: T }
  | { ok: false; res: NextResponse }
> {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
