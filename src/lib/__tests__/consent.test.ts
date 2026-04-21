/**
 * Tests for lib/consent.ts — localStorage-based consent utilities.
 * Runs in jsdom (default) so localStorage is available.
 */
import {
  CONSENT_POLICY_VERSION,
  loadConsent,
  saveConsentLocally,
  clearConsent,
  type ConsentRecord,
} from "../consent";

const STORAGE_KEY = "mamae_consent";

function makeRecord(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    accepted: true,
    version: CONSENT_POLICY_VERSION,
    acceptedAt: new Date().toISOString(),
    parentalConsent: true,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// loadConsent
// ---------------------------------------------------------------------------

describe("loadConsent", () => {
  it("returns null when localStorage is empty", () => {
    expect(loadConsent()).toBeNull();
  });

  it("returns null when stored record has a different policy version", () => {
    const stale = makeRecord({ version: "2020-01-01" });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stale));
    expect(loadConsent()).toBeNull();
  });

  it("returns the record when version matches current policy", () => {
    const record = makeRecord();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    expect(loadConsent()).toEqual(record);
  });

  it("returns null when stored value is invalid JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json{{");
    expect(loadConsent()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// saveConsentLocally
// ---------------------------------------------------------------------------

describe("saveConsentLocally", () => {
  it("persists the consent record to localStorage", () => {
    const record = makeRecord();
    saveConsentLocally(record);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(record);
  });

  it("overwrites an existing record", () => {
    saveConsentLocally(makeRecord({ acceptedAt: "2026-01-01T00:00:00.000Z" }));
    const updated = makeRecord({ acceptedAt: "2026-04-01T12:00:00.000Z" });
    saveConsentLocally(updated);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(updated);
  });
});

// ---------------------------------------------------------------------------
// clearConsent
// ---------------------------------------------------------------------------

describe("clearConsent", () => {
  it("removes the consent record from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeRecord()));
    clearConsent();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("does not throw when localStorage is already empty", () => {
    expect(() => clearConsent()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// round-trip
// ---------------------------------------------------------------------------

describe("round-trip: save then load", () => {
  it("returns the same record after saving", () => {
    const record = makeRecord();
    saveConsentLocally(record);
    expect(loadConsent()).toEqual(record);
  });

  it("returns null after saving then clearing", () => {
    saveConsentLocally(makeRecord());
    clearConsent();
    expect(loadConsent()).toBeNull();
  });
});
