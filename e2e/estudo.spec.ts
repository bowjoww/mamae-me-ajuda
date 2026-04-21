/**
 * Jornada 4 — /estudo flashcard duelo
 *
 * Validates:
 * - Hub state: quest cards and "Começar coleta" CTA visible
 * - Click "Começar coleta" enters ArenaShell (collect mode)
 * - FlashcardDuel renders: question visible, grade buttons disabled
 * - Click "Revelar resposta" reveals the answer, grade buttons become enabled
 * - Click "Acertei" grades the card and moves to next or recap
 * - Recap screen shows hit count and "Voltar ao acampamento"
 */

import { test, expect } from "@playwright/test";
import { bypassConsent, captureAndAttach } from "./helpers";

test.describe("/estudo — coleta de flashcards", () => {
  test.beforeEach(async ({ page }) => {
    await bypassConsent(page);
  });

  test("hub state renders quest cards and CTA", async ({ page }, testInfo) => {
    await page.goto("/estudo");

    // "Começar coleta" button should be visible
    const startBtn = page.getByRole("button", { name: /Começar coleta/i });
    await expect(startBtn).toBeVisible({ timeout: 10000 });

    // "Coleta de hoje" heading
    await expect(page.getByText(/Coleta de hoje/i)).toBeVisible();

    // With mock data: featured quest should render
    // mockQuests[0] is "Função Quadrática" (featured) — use heading role to be specific
    await expect(
      page.getByRole("heading", { name: /Função Quadrática/i })
    ).toBeVisible({ timeout: 5000 });

    await captureAndAttach(page, testInfo, "estudo-hub-state");
  });

  test("click 'Começar coleta' enters ArenaShell", async ({ page }, testInfo) => {
    await page.goto("/estudo");

    const startBtn = page.getByRole("button", { name: /Começar coleta/i });
    await expect(startBtn).toBeVisible({ timeout: 10000 });
    await startBtn.click();

    // ArenaShell header should appear with "travessia" text
    const arenaHeader = page.getByText(/travessia/i);
    await expect(arenaHeader).toBeVisible({ timeout: 5000 });

    // "Sair" button should be visible
    await expect(page.getByRole("button", { name: /Sair da sessão/i })).toBeVisible();

    await captureAndAttach(page, testInfo, "estudo-arena-active");
  });

  test("FlashcardDuel renders question and hint text", async ({ page }, testInfo) => {
    await page.goto("/estudo");

    const startBtn = page.getByRole("button", { name: /Começar coleta/i });
    await expect(startBtn).toBeVisible({ timeout: 10000 });
    await startBtn.click();

    // FlashcardDuel section
    const duelSection = page.getByRole("region", { name: /Duelo de flashcards/i });
    await expect(duelSection).toBeVisible({ timeout: 5000 });

    // Question text (card.front from mockFlashcards[0])
    await expect(
      page.getByText(/forma geral de uma função quadrática/i)
    ).toBeVisible({ timeout: 5000 });

    // Subject label
    await expect(page.getByText(/Matemática/i)).toBeVisible();

    // "Revelar resposta" button present and grade buttons visible but disabled
    await expect(
      page.getByRole("button", { name: /Revelar resposta/i })
    ).toBeVisible();

    await captureAndAttach(page, testInfo, "estudo-flashcard-question");
  });

  test("'Revelar resposta' reveals answer and enables grade buttons", async ({
    page,
  }, testInfo) => {
    await page.goto("/estudo");

    const startBtn = page.getByRole("button", { name: /Começar coleta/i });
    await expect(startBtn).toBeVisible({ timeout: 10000 });
    await startBtn.click();

    await expect(
      page.getByRole("button", { name: /Revelar resposta/i })
    ).toBeVisible({ timeout: 5000 });

    // Grade buttons should be disabled before reveal
    const acerteiBtn = page.getByRole("button", { name: "Acertei", exact: true });
    const erreiBtn = page.getByRole("button", { name: /Errei esta questão/i });
    await expect(acerteiBtn).toBeDisabled();
    await expect(erreiBtn).toBeDisabled();

    // Reveal
    await page.getByRole("button", { name: /Revelar resposta/i }).click();

    // Answer text should appear (card.back contains "ax² + bx + c")
    await expect(page.getByText(/ax.*bx.*c/i)).toBeVisible({
      timeout: 3000,
    });

    // Grade buttons now enabled
    await expect(acerteiBtn).not.toBeDisabled();
    await expect(erreiBtn).not.toBeDisabled();

    await captureAndAttach(page, testInfo, "estudo-flashcard-revealed");
  });

  test("click 'Acertei' advances to next card or recap", async ({ page }, testInfo) => {
    await page.goto("/estudo");

    const startBtn = page.getByRole("button", { name: /Começar coleta/i });
    await expect(startBtn).toBeVisible({ timeout: 10000 });
    await startBtn.click();

    // Grade all 3 mock flashcards as "acertei"
    for (let i = 0; i < 3; i++) {
      await expect(
        page.getByRole("button", { name: /Revelar resposta/i })
      ).toBeVisible({ timeout: 5000 });

      await page.getByRole("button", { name: /Revelar resposta/i }).click();

      const acerteiBtn = page.getByRole("button", { name: "Acertei", exact: true });
      await expect(acerteiBtn).not.toBeDisabled({ timeout: 3000 });
      await acerteiBtn.click();

      // After last card, recap appears; otherwise next card loads
    }

    // After 3 cards, recap state should appear
    // "Coleta concluída" is the recap heading; use exact paragraph match
    await expect(page.getByText(/Coleta concluída/i).first()).toBeVisible({ timeout: 8000 });

    await captureAndAttach(page, testInfo, "estudo-after-grading");
  });

  test("recap screen shows hit stats and exit button", async ({ page }, testInfo) => {
    await page.goto("/estudo");

    const startBtn = page.getByRole("button", { name: /Começar coleta/i });
    await expect(startBtn).toBeVisible({ timeout: 10000 });
    await startBtn.click();

    // Grade all 3 cards
    for (let i = 0; i < 3; i++) {
      await expect(
        page.getByRole("button", { name: /Revelar resposta/i })
      ).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: /Revelar resposta/i }).click();
      const acerteiBtn = page.getByRole("button", { name: "Acertei", exact: true });
      await expect(acerteiBtn).not.toBeDisabled({ timeout: 3000 });
      await acerteiBtn.click();
    }

    // Recap state
    await expect(page.getByText(/Coleta concluída/i)).toBeVisible({
      timeout: 8000,
    });

    // "X acertos de Y" summary
    await expect(page.getByText(/\d+\s*acertos\s*de\s*\d+/i)).toBeVisible();

    // Exit button
    await expect(
      page.getByRole("button", { name: /Voltar ao acampamento/i })
    ).toBeVisible();

    await captureAndAttach(page, testInfo, "estudo-recap-screen");
  });

  test("'Voltar ao acampamento' returns to hub state", async ({ page }) => {
    await page.goto("/estudo");

    const startBtn = page.getByRole("button", { name: /Começar coleta/i });
    await expect(startBtn).toBeVisible({ timeout: 10000 });
    await startBtn.click();

    // Quick-grade all cards
    for (let i = 0; i < 3; i++) {
      await expect(
        page.getByRole("button", { name: /Revelar resposta/i })
      ).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: /Revelar resposta/i }).click();
      const acerteiBtn = page.getByRole("button", { name: "Acertei", exact: true });
      await expect(acerteiBtn).not.toBeDisabled({ timeout: 3000 });
      await acerteiBtn.click();
    }

    await expect(page.getByText(/Coleta concluída/i)).toBeVisible({
      timeout: 8000,
    });

    await page
      .getByRole("button", { name: /Voltar ao acampamento/i })
      .click();

    // Should be back to hub with "Começar coleta"
    await expect(
      page.getByRole("button", { name: /Começar coleta/i })
    ).toBeVisible({ timeout: 5000 });
  });
});
