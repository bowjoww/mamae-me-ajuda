"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const STUDENT_NAME_KEY = "mma.studentName";

/**
 * Tri-state hook that resolves the current student name across navigations.
 *
 *   null  — still hydrating (localStorage read pending)
 *   ""    — hydrated, no name known yet (render WelcomeScreen)
 *   "X"   — hydrated, use this name
 *
 * Resolution order on mount:
 *   1. localStorage `mma.studentName` (fast path, avoids a Supabase round-trip)
 *   2. Supabase session `user_metadata.full_name` / `.name` — first word only
 *      so we don't stamp a parent's full legal name as the student name when
 *      the signed-in Google account belongs to the responsável.
 *
 * Behaviour before this hook existed: `/` stored the name in component state,
 * so tapping the Chat tab (href='/') re-mounted the page with an empty state
 * and the WelcomeScreen re-rendered every time, asking for the name again.
 */
export function useStudentName(): {
  studentName: string | null;
  setStudentName: (name: string) => void;
  clearStudentName: () => void;
} {
  const [studentName, setStudentNameState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Fast path: cached name.
    let initial = "";
    try {
      initial = window.localStorage.getItem(STUDENT_NAME_KEY) ?? "";
    } catch {
      // localStorage disabled — fall through to auth-derived name.
    }

    if (initial.trim().length > 0) {
      setStudentNameState(initial);
      return;
    }

    // Slow path: ask Supabase for the signed-in user's Google metadata.
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        const metadata = data.user?.user_metadata as
          | { full_name?: unknown; name?: unknown }
          | undefined;
        const full =
          (typeof metadata?.full_name === "string" ? metadata.full_name : null) ??
          (typeof metadata?.name === "string" ? metadata.name : null);
        const firstWord = full?.split(/\s+/)[0]?.trim() ?? "";
        if (firstWord.length > 0) {
          try {
            window.localStorage.setItem(STUDENT_NAME_KEY, firstWord);
          } catch {
            // ignore
          }
          setStudentNameState(firstWord);
        } else {
          setStudentNameState("");
        }
      } catch {
        setStudentNameState("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setStudentName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      window.localStorage.setItem(STUDENT_NAME_KEY, trimmed);
    } catch {
      // ignore
    }
    setStudentNameState(trimmed);
  }, []);

  const clearStudentName = useCallback(() => {
    try {
      window.localStorage.removeItem(STUDENT_NAME_KEY);
    } catch {
      // ignore
    }
    setStudentNameState("");
  }, []);

  return { studentName, setStudentName, clearStudentName };
}
