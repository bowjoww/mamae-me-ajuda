"use client";

import { useCallback, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Hook that triggers the Google OAuth flow via Supabase.
 *
 * On button click:
 *   - Calls `signInWithOAuth({ provider: 'google' })`
 *   - Supabase constructs the Google consent URL and returns it
 *   - We redirect the browser to Google; Google redirects back to
 *     `${SUPABASE_URL}/auth/v1/callback` with a code, which Supabase forwards
 *     to our `/auth/callback` route handler (see `src/app/auth/callback/route.ts`).
 *
 * Error handling: any Supabase SDK error is stored in `error` so the caller
 * can render a small message. Retrying just re-opens the OAuth flow.
 */
export function useGoogleSignIn(): {
  signInWithGoogle: (nextPath?: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
} {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = useCallback(async (nextPath?: string) => {
    setIsLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    // Build the post-auth destination. Supabase will append the code to the
    // `redirectTo` URL — our callback route handles the exchange + redirect.
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const next = nextPath ?? "/";
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        // Ask Google for the user's display name + email — we use `full_name`
        // to pre-fill the child record on first login.
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });

    if (signInError) {
      setError(signInError.message);
      setIsLoading(false);
      return;
    }

    // Supabase SDK has already triggered window.location = googleAuthUrl.
    // No need to setIsLoading(false) — the page is leaving.
  }, []);

  return { signInWithGoogle, isLoading, error };
}
