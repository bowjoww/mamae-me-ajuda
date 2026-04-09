"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { setPostHogInstance, POSTHOG_OPTIONS, AnalyticsEvent, track } from "@/lib/analytics";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/**
 * Initialises PostHog once on the client side and registers the instance
 * with the analytics module. Fires `app_opened` on first load.
 *
 * Place this inside the <body> of RootLayout so it runs for every route.
 */
export function PostHogProvider() {
  useEffect(() => {
    if (!POSTHOG_KEY) return;

    posthog.init(POSTHOG_KEY, POSTHOG_OPTIONS);
    setPostHogInstance(posthog);

    track(AnalyticsEvent.APP_OPENED);

    return () => {
      // Nothing to tear down; PostHog manages its own lifecycle
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
