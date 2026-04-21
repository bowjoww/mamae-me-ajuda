"use client";

import { useEffect, useState } from "react";
import { setPostHogInstance, getPostHogInstance, POSTHOG_OPTIONS, AnalyticsEvent, track } from "@/lib/analytics";
import type posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/**
 * Lazily initialises PostHog after first paint + idle time and registers the
 * instance with the analytics module. Fires `app_opened` on first load.
 *
 * The posthog-js library (~56 kB gzipped) is dynamically imported inside a
 * requestIdleCallback so it never blocks the critical path or TTI.
 *
 * Place this inside the <body> of RootLayout so it runs for every route.
 */
export function PostHogProvider() {
  useEffect(() => {
    if (typeof window === "undefined" || !POSTHOG_KEY) return;

    type IdleHandle = number;
    const schedule =
      (window as typeof window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => IdleHandle }).requestIdleCallback ??
      ((cb: () => void) => setTimeout(cb, 500) as unknown as IdleHandle);

    const cancel =
      (window as typeof window & { cancelIdleCallback?: (h: IdleHandle) => void }).cancelIdleCallback ??
      ((h: IdleHandle) => clearTimeout(h as unknown as ReturnType<typeof setTimeout>));

    const handle: IdleHandle = schedule(() => {
      import("posthog-js").then(({ default: ph }: { default: typeof posthog }) => {
        ph.init(POSTHOG_KEY as string, POSTHOG_OPTIONS);
        setPostHogInstance(ph);
        track(AnalyticsEvent.APP_OPENED);
      }).catch(() => {
        // Never let analytics failures surface to users
      });
    }, { timeout: 2000 });

    return () => cancel(handle);
  }, []);

  return null;
}

/**
 * Returns the live posthog instance once it has been lazily loaded, or null
 * if analytics has not initialised yet. Callers must handle the null case.
 */
export function usePostHog(): typeof posthog | null {
  const [instance, setInstance] = useState<typeof posthog | null>(() => getPostHogInstance());

  useEffect(() => {
    // If already available (captured via lazy initial state, or navigating to
    // a second page after first-page init), no polling needed. No setState in
    // effect body — that triggers react-hooks/set-state-in-effect.
    if (instance) return;

    // Poll at low frequency until PostHog finishes its idle-callback init.
    const interval = setInterval(() => {
      const ph = getPostHogInstance();
      if (ph) {
        setInstance(ph);
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [instance]);

  return instance;
}
