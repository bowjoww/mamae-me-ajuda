"use client";

import { useCallback, useEffect, useState } from "react";
import { loadConsent } from "@/lib/consent";

/**
 * Tri-state consent hook:
 *   null  — still loading (hydration-safe)
 *   true  — consent present and current
 *   false — no consent or policy version changed
 */
export function useConsent(): {
  consentGiven: boolean | null;
  acceptConsent: () => void;
} {
  const [consentGiven, setConsentGiven] = useState<boolean | null>(null);

  useEffect(() => {
    const record = loadConsent();
    // setState inside effect is required here: localStorage is browser-only,
    // so consent cannot be determined during SSR. The initial `null` state
    // is a hydration marker the caller uses to avoid a flash.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsentGiven(record?.accepted === true);
  }, []);

  const acceptConsent = useCallback(() => {
    setConsentGiven(true);
  }, []);

  return { consentGiven, acceptConsent };
}
