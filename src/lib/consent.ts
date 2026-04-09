export const CONSENT_POLICY_VERSION = "2026-04-01";
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
