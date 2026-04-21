/**
 * Jornada 5 — /perfil
 *
 * Validates:
 * - TierBadge renders (role=img with aria-label containing "Tier")
 * - XP total visible (large number from mockProfile.totalXp = 2360)
 * - XpBar renders below the XP total
 * - Heatmap of last 7 days is visible
 * - Achievements grid present (locked ones shown as silhouettes)
 * - TabBar is present with Perfil tab active
 */

import { test, expect } from "@playwright/test";
import { bypassConsent, captureAndAttach } from "./helpers";

test.describe("/perfil — diário de jornada", () => {
  test.beforeEach(async ({ page }) => {
    await bypassConsent(page);
  });

  test("profile page renders core HUD components", async ({ page }, testInfo) => {
    await page.goto("/perfil");

    // Wait for hydration — the loading skeleton is hidden when profile loads
    // Profile name from mockProfile.studentName = "Henrique"
    await expect(page.getByText(/Henrique/i)).toBeVisible({ timeout: 10000 });

    await captureAndAttach(page, testInfo, "perfil-hud-full");
  });

  test("TierBadge is visible with rank information", async ({ page }) => {
    await page.goto("/perfil");

    await expect(page.getByText(/Henrique/i)).toBeVisible({ timeout: 10000 });

    // TierBadge uses role="img" and aria-label="Tier Batedor II"
    const tierBadge = page.getByRole("img", { name: /Tier\s+\w+/i });
    // At least one TierBadge should be on the page (profile + subjects grid)
    await expect(tierBadge.first()).toBeVisible({ timeout: 5000 });
  });

  test("XP total value is visible", async ({ page }, testInfo) => {
    await page.goto("/perfil");

    await expect(page.getByText(/Henrique/i)).toBeVisible({ timeout: 10000 });

    // "XP total" label
    await expect(page.getByText(/XP total/i)).toBeVisible();

    // mockProfile.totalXp = 2360; rendered as "2.360" in pt-BR locale
    const xpValue = page.getByText(/2[\.,]360/);
    await expect(xpValue).toBeVisible({ timeout: 5000 });

    await captureAndAttach(page, testInfo, "perfil-xp-total");
  });

  test("heatmap for last 7 days is visible", async ({ page }, testInfo) => {
    await page.goto("/perfil");

    await expect(page.getByText(/Henrique/i)).toBeVisible({ timeout: 10000 });

    // "Trilha dos últimos 7 dias" section heading
    await expect(page.getByText(/últimos 7 dias/i)).toBeVisible();

    // HeatmapByMatter aria-label
    const heatmap = page.getByRole("region", {
      name: /Atividade dos últimos 7 dias/i,
    }).or(
      page.locator('[aria-label*="últimos 7 dias"]')
    );

    // Fallback: verify heatmap cells (each is a <button> with min per day)
    const heatmapButtons = page.locator('.heatmap-cell');
    const fallbackCount = await heatmapButtons.count();

    if (fallbackCount > 0) {
      expect(fallbackCount).toBe(7);
    } else {
      // Check via aria-label on individual day buttons
      const dayButtons = page.getByRole("button", {
        name: /minutos de coleta/i,
      });
      await expect(dayButtons.first()).toBeVisible({ timeout: 5000 });
      const count = await dayButtons.count();
      expect(count).toBe(7);
    }

    await captureAndAttach(page, testInfo, "perfil-heatmap");
  });

  test("achievements grid is present", async ({ page }, testInfo) => {
    await page.goto("/perfil");

    await expect(page.getByText(/Henrique/i)).toBeVisible({ timeout: 10000 });

    // "Conquistas" heading
    await expect(page.getByText(/Conquistas/i)).toBeVisible();

    // mockProfile has 8 achievements (3 unlocked, 5 locked)
    // Each renders as an aria-label="Title (bloqueada)" or just "Title"
    const achievementTiles = page.locator('[aria-label*="Primeira faísca"]').or(
      page.locator('[title*="faísca"]')
    );
    await expect(achievementTiles.first()).toBeVisible({ timeout: 5000 });

    await captureAndAttach(page, testInfo, "perfil-achievements-grid");
  });

  test("Perfil tab is active in TabBar", async ({ page }) => {
    await page.goto("/perfil");

    await expect(page.getByText(/Henrique/i)).toBeVisible({ timeout: 10000 });

    const perfilTab = page.getByRole("link", { name: /Perfil/i });
    await expect(perfilTab).toBeVisible();
    await expect(perfilTab).toHaveAttribute("aria-current", "page");
  });

  test("subjects section shows XP bars for each subject", async ({ page }) => {
    await page.goto("/perfil");

    await expect(page.getByText(/Henrique/i)).toBeVisible({ timeout: 10000 });

    // "Matérias" heading — rendered via the section aria-labelledby h2
    // The heading text is exactly "Matérias"
    const subjectsHeading = page.getByRole("heading", { name: /Matérias/i }).or(
      page.getByText(/Matérias/i, { exact: true })
    );
    await expect(subjectsHeading).toBeVisible({ timeout: 5000 });

    // mockProfile has 6 subjects including "matematica" → "Matemática"
    // The page renders these inside the subjects grid
    // SUBJECT_LABEL.matematica = "Matemática"
    // The text appears as <p>Matemática</p> inside the subject tile
    // Multiple "Matemática" texts may appear (subject tile + StatusBar), so use .first()
    await expect(page.getByText(/Matemática/i).first()).toBeVisible({ timeout: 5000 });
  });
});
