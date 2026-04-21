/**
 * Shared helpers for E2E specs.
 *
 * All tests in this suite use NEXT_PUBLIC_USE_MOCK_GAMIFICATION=1, so the
 * gamification endpoints fall back to fixture data — no real Supabase calls.
 * The chat API is mocked per-test via page.route().
 */

import type { Page } from "@playwright/test";
import path from "path";

// ---------------------------------------------------------------------------
// Route mocks
// ---------------------------------------------------------------------------

/** Intercept /api/chat and return a Socratic fake response. */
export async function mockChatApi(
  page: Page,
  response = "Interessante! Antes de eu explicar, o que você já sabe sobre fração?"
) {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ response }),
    });
  });
}

/** Intercept /api/consent so it never hits a real endpoint. */
export async function mockConsentApi(page: Page) {
  await page.route("**/api/consent", async (route) => {
    await route.fulfill({ status: 200, body: "{}" });
  });
}

/** Mock all gamification API calls (belt-and-suspenders alongside env var). */
export async function mockGamificationApis(page: Page) {
  await page.route("**/api/gamification/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: null }),
    });
  });
  await page.route("**/api/study/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: null }),
    });
  });
}

// ---------------------------------------------------------------------------
// Consent flow helpers
// ---------------------------------------------------------------------------

/**
 * Accept the LGPD consent modal if it is present.
 * Persists acceptance to localStorage so subsequent navigations skip it.
 */
export async function acceptConsentIfPresent(page: Page) {
  // Give the modal a moment to render (it waits for hydration)
  const modalTitle = page.getByText(/Consentimento Parental/i);
  const appeared = await modalTitle
    .waitFor({ state: "visible", timeout: 4000 })
    .then(() => true)
    .catch(() => false);

  if (!appeared) return;

  const checkbox = page.getByRole("checkbox", {
    name: /aceito|consinto|responsável/i,
  });
  await checkbox.check();

  const acceptBtn = page.getByRole("button", { name: /Aceitar e continuar/i });
  await acceptBtn.click();
}

/**
 * Bypass consent entirely by writing the consent record to localStorage
 * before the page loads — useful for tests that don't focus on the consent
 * flow itself.
 *
 * The version MUST match CONSENT_POLICY_VERSION ("2026-04-01") from
 * src/lib/consent.ts — loadConsent() rejects records with a stale version.
 */
export async function bypassConsent(page: Page) {
  await page.addInitScript(() => {
    const record = JSON.stringify({
      accepted: true,
      version: "2026-04-01",
      acceptedAt: new Date().toISOString(),
      parentalConsent: true,
    });
    window.localStorage.setItem("mamae_consent", record);
  });
}

// ---------------------------------------------------------------------------
// Welcome screen / chat entry
// ---------------------------------------------------------------------------

/**
 * Complete the welcome flow: bypass consent + enter student name.
 * After this call, the chat interface is visible.
 */
export async function enterChat(
  page: Page,
  opts: { name?: string; mockChat?: boolean } = {}
) {
  const { name = "Henrique", mockChat = true } = opts;

  if (mockChat) await mockChatApi(page);
  await bypassConsent(page);
  await page.goto("/");

  await page.getByPlaceholder(/seu nome/i).fill(name);
  await page.getByRole("button", { name: /começar|vamos lá|entrar/i }).click();

  // Wait for the welcome message that includes the student's name.
  // Use .first() because the message also appears in an aria-live polite region.
  const welcomeMsg = page.getByText(new RegExp(`Oi,\\s*${name}`, "i")).first();
  await welcomeMsg.waitFor({ state: "visible", timeout: 8000 });
}

// ---------------------------------------------------------------------------
// Screenshot helpers
// ---------------------------------------------------------------------------

/** Attach a named screenshot to the test report and save to disk. */
export async function captureAndAttach(
  page: Page,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testInfo: any,
  name: string
) {
  const screenshotDir = path.join("e2e", "screenshots", "android");
  const filename = `${name.replace(/\s+/g, "-").toLowerCase()}.png`;
  const fullPath = path.join(screenshotDir, filename);

  const buffer = await page.screenshot({ fullPage: false, path: fullPath });
  await testInfo.attach(name, { body: buffer, contentType: "image/png" });
  return fullPath;
}
