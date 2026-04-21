/**
 * Policy version string — bumped when the disclosure text changes in a
 * way that requires fresh consent under LGPD Art. 8. Any stored record
 * with a different version is invalidated in `loadConsent` and the user
 * is asked to consent again.
 *
 * 2026-04-20-v2: names OpenAI/GPT-5.1 and Google/Gemini explicitly as
 * the data operators (LGPD Art. 9, IV — transparency about who processes
 * the data). Previously the text said only "processado pela IA" without
 * identifying the controllers.
 */
export const CONSENT_POLICY_VERSION = "2026-04-20-v2";
const CONSENT_STORAGE_KEY = "mamae_consent";

export interface ConsentRecord {
  accepted: boolean;
  version: string;
  acceptedAt: string;
  parentalConsent: boolean;
}

export function loadConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as ConsentRecord;
    // Require re-consent if policy version changed
    if (record.version !== CONSENT_POLICY_VERSION) return null;
    return record;
  } catch {
    return null;
  }
}

export function saveConsentLocally(record: ConsentRecord): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
}

export function clearConsent(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CONSENT_STORAGE_KEY);
}
