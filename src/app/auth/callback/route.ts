import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth callback handler.
 *
 * Flow:
 *   1. User taps "Continuar com Google" on the app → we call
 *      supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: '…/auth/callback' })
 *   2. Supabase redirects to Google → user consents → Google redirects to
 *      `${SUPABASE_URL}/auth/v1/callback` → Supabase redirects here with
 *      `?code=<otp>` in the URL.
 *   3. We swap the code for a session via `exchangeCodeForSession` — the
 *      session cookie is set on our domain via the Supabase server client,
 *      so subsequent requests to /api/study/* and /api/gamification/* pass
 *      the middleware auth gate.
 *   4. Redirect back to the page the user came from (or `/` as a safe fallback).
 *
 * Security notes:
 *   - The `next` query param is validated against an allow-list of relative
 *     paths so a malicious redirect target cannot be injected.
 *   - On any error we redirect to `/` with `?auth_error=1` so the UI can
 *     surface a friendly message rather than leaking the raw Supabase error.
 */

const SAFE_REDIRECT_PATHS = new Set(["/", "/prova", "/estudo", "/perfil"]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  const next = SAFE_REDIRECT_PATHS.has(nextParam) ? nextParam : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Don't leak the raw Supabase error to the URL — just signal failure.
    return NextResponse.redirect(`${origin}/?auth_error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
