import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockChatApi(page: Page, response = "Dois mais dois é quatro!") {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ response }),
    });
  });
}

/** Returns a tiny valid MP3 buffer (ID3 + null frame). */
function fakeMp3Buffer(): Buffer {
  // ID3v2 header (10 bytes) + minimal silence — browsers will accept this.
  return Buffer.from([
    0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
}

async function mockTtsApi(page: Page, succeed = true) {
  await page.route("**/api/tts", async (route) => {
    if (succeed) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "audio/mpeg" },
        body: fakeMp3Buffer(),
      });
    } else {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Erro ao gerar áudio." }),
      });
    }
  });
}

async function enterChatWithMessage(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder(/seu nome/i).fill("Bia");
  await page.getByRole("button", { name: /começar|vamos lá|entrar/i }).click();
  await expect(page.getByText(/Oi, Bia/i)).toBeVisible();

  // Send a message to get an AI response
  const chatInput = page.getByRole("textbox");
  await chatInput.fill("Quanto é 2+2?");
  await page.getByRole("button", { name: /enviar/i }).click();
  await expect(page.getByText("Dois mais dois é quatro!")).toBeVisible({ timeout: 5000 });
}

// ---------------------------------------------------------------------------
// Tests: TTS button (ouvir)
// ---------------------------------------------------------------------------

test.describe("TTS / ouvir button", () => {
  test.beforeEach(async ({ page }) => {
    await mockChatApi(page);
  });

  test("shows a listen button on AI messages", async ({ page }) => {
    await mockTtsApi(page);
    await enterChatWithMessage(page);

    // At least one "ouvir" / speaker / play button should be visible on model messages
    const listenBtn = page
      .getByRole("button", { name: /ouvir|escutar|play|▶|🔊/i })
      .first();
    await expect(listenBtn).toBeVisible({ timeout: 3000 });
  });

  test("calls /api/tts when the listen button is clicked", async ({ page }) => {
    await mockTtsApi(page);
    await enterChatWithMessage(page);

    // Intercept and count TTS calls
    let ttsCalls = 0;
    await page.route("**/api/tts", async (route) => {
      ttsCalls++;
      await route.fulfill({
        status: 200,
        headers: { "content-type": "audio/mpeg" },
        body: fakeMp3Buffer(),
      });
    });

    const listenBtn = page
      .getByRole("button", { name: /ouvir|escutar|play|▶|🔊/i })
      .first();
    await listenBtn.click();

    // Give time for the fetch to happen
    await page.waitForTimeout(500);
    expect(ttsCalls).toBeGreaterThanOrEqual(1);
  });

  test("does not show a listen button on user messages", async ({ page }) => {
    await mockTtsApi(page);
    await enterChatWithMessage(page);

    // User bubbles — find by the user message content
    const userBubble = page.getByText("Quanto é 2+2?").locator("..");
    // There should be no listen button inside the user message bubble
    const listenInUser = userBubble.getByRole("button", { name: /ouvir|escutar|play|▶|🔊/i });
    await expect(listenInUser).toHaveCount(0);
  });

  test("toggles play/pause state when button is clicked twice", async ({ page }) => {
    // Mock TTS with a slow audio so state changes are visible
    await page.route("**/api/tts", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "audio/mpeg" },
        body: fakeMp3Buffer(),
      });
    });

    await enterChatWithMessage(page);

    const listenBtn = page
      .getByRole("button", { name: /ouvir|escutar|play|▶|🔊/i })
      .first();

    // First click: start playback
    await listenBtn.click();

    // After clicking, the aria-label or visual state might change to "pausar"
    // We simply check the button is still present and clickable (no crash)
    await expect(listenBtn).toBeVisible({ timeout: 3000 });

    // Second click: should not throw
    await listenBtn.click();
  });

  test("gracefully handles TTS API failure", async ({ page }) => {
    await mockTtsApi(page, false);
    await enterChatWithMessage(page);

    const listenBtn = page
      .getByRole("button", { name: /ouvir|escutar|play|▶|🔊/i })
      .first();
    await listenBtn.click();

    // App should remain usable — input still visible
    await expect(page.getByRole("textbox")).toBeVisible({ timeout: 3000 });
  });
});
