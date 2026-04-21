/**
 * Jornada 1 — Onboarding + Consentimento
 *
 * Validates:
 * - ConsentModal appears on first visit
 * - Focus trap: Tab cycles inside the modal without escaping
 * - Escape key triggers the "refused" screen instead of silently dismissing
 * - Accept flow leads to WelcomeScreen
 * - WelcomeScreen accepts a name and launches the chat
 */

import { test, expect } from "@playwright/test";
import { mockChatApi, mockConsentApi, captureAndAttach } from "./helpers";

test.describe("Onboarding — consent modal", () => {
  test.beforeEach(async ({ page }) => {
    // Never skip — these tests are specifically about the consent flow
    await mockConsentApi(page);
    await mockChatApi(page);
    // Ensure a fresh localStorage (no existing consent)
    await page.addInitScript(() => {
      window.localStorage.removeItem("mamae_consent");
    });
  });

  test("ConsentModal appears on first visit", async ({ page }, testInfo) => {
    await page.goto("/");

    // Modal should be present: role=dialog with the consent title
    const dialog = page.getByRole("dialog", { name: /Consentimento Parental/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });

    await captureAndAttach(page, testInfo, "consent-modal-visible");
  });

  test("focus trap — Tab stays inside the modal", async ({ page }) => {
    await page.goto("/");

    const dialog = page.getByRole("dialog", { name: /Consentimento Parental/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });

    // Collect focusable elements inside the modal
    // Expected: checkbox, "Aceitar e continuar" button, "Recusar" button,
    //           possibly the privacy policy link
    // Tab 6 times; every focused element must be inside the dialog
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");

      const focusedTag = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return "none";
        return el.tagName.toLowerCase();
      });

      const isInsideDialog = await page.evaluate(() => {
        const focused = document.activeElement;
        if (!focused) return false;
        const dialog = document.querySelector('[role="dialog"]');
        return dialog ? dialog.contains(focused) : false;
      });

      expect(isInsideDialog, `Tab ${i + 1}: focused <${focusedTag}> escaped modal`).toBe(true);
    }
  });

  test("Escape key opens the refused screen", async ({ page }, testInfo) => {
    await page.goto("/");

    const dialog = page.getByRole("dialog", { name: /Consentimento Parental/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });

    await page.keyboard.press("Escape");

    // Should show the refused state (not just dismiss)
    const refusedText = page.getByText(/Sem consentimento, sem acesso/i);
    await expect(refusedText).toBeVisible({ timeout: 5000 });

    // "Voltar aos termos" button should be present
    await expect(page.getByRole("button", { name: /Voltar aos termos/i })).toBeVisible();

    await captureAndAttach(page, testInfo, "consent-refused-screen");
  });

  test("'Voltar aos termos' restores the consent modal", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("dialog", { name: /Consentimento Parental/i })
    ).toBeVisible({ timeout: 6000 });

    await page.keyboard.press("Escape");
    await expect(page.getByText(/Sem consentimento, sem acesso/i)).toBeVisible();

    await page.getByRole("button", { name: /Voltar aos termos/i }).click();

    // Consent modal should be back
    await expect(
      page.getByRole("dialog", { name: /Consentimento Parental/i })
    ).toBeVisible({ timeout: 3000 });
  });

  test("accept consent leads to WelcomeScreen name input", async ({ page }, testInfo) => {
    await page.goto("/");

    const dialog = page.getByRole("dialog", { name: /Consentimento Parental/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });

    // Check the parental consent checkbox
    const checkbox = page.getByRole("checkbox");
    await checkbox.check();
    await expect(checkbox).toBeChecked();

    // Accept button should now be enabled
    const acceptBtn = page.getByRole("button", { name: /Aceitar e continuar/i });
    await expect(acceptBtn).not.toBeDisabled();

    await acceptBtn.click();

    // Modal gone, WelcomeScreen visible with name input
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByPlaceholder(/seu nome/i)).toBeVisible({ timeout: 3000 });

    await captureAndAttach(page, testInfo, "post-consent-welcome-screen");
  });

  test("WelcomeScreen — enter name Henrique and start chat", async ({ page }, testInfo) => {
    await page.goto("/");

    // Accept consent first
    const dialog = page.getByRole("dialog", { name: /Consentimento Parental/i });
    await expect(dialog).toBeVisible({ timeout: 6000 });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Aceitar e continuar/i }).click();

    // Wait for the modal to fully unmount before interacting with WelcomeScreen
    await expect(dialog).not.toBeVisible({ timeout: 4000 });

    // Fill name
    const nameInput = page.getByPlaceholder(/seu nome/i);
    await expect(nameInput).toBeVisible({ timeout: 4000 });
    await nameInput.fill("Henrique");

    // Start — the button is not blocked by the modal anymore
    const startBtn = page.getByRole("button", { name: /Começar/i });
    await expect(startBtn).toBeEnabled({ timeout: 2000 });
    await startBtn.click();

    // Welcome message is generated locally — no API call needed
    // Use .first() because the message also appears in an aria-live polite region
    await expect(page.getByText(/Oi,\s*Henrique/i).first()).toBeVisible({ timeout: 6000 });

    await captureAndAttach(page, testInfo, "post-consent-chat-welcome");
  });

  test("'Aceitar e continuar' button is disabled until checkbox is ticked", async ({ page }) => {
    await page.goto("/");

    const acceptBtn = page.getByRole("button", { name: /Aceitar e continuar/i });
    await expect(acceptBtn).toBeVisible({ timeout: 6000 });

    // Without checking the box, the button should be non-interactive
    const isDisabled = await acceptBtn.evaluate((el) =>
      el.hasAttribute("disabled") ||
      el.getAttribute("aria-disabled") === "true" ||
      window.getComputedStyle(el).cursor === "not-allowed"
    );
    expect(isDisabled).toBe(true);
  });
});
