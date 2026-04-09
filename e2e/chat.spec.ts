import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Intercept /api/chat and return a fake AI response. */
async function mockChatApi(page: Page, response = "Vamos pensar juntos! Quanto é 2 somado a 2?") {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ response }),
    });
  });
}

/** Complete the welcome screen and arrive at the chat interface. */
async function enterChat(page: Page, name = "Ana") {
  await page.goto("/");
  await page.getByPlaceholder(/seu nome/i).fill(name);
  await page.getByRole("button", { name: /começar|vamos lá|entrar/i }).click();
  // Welcome message from the AI should appear
  await expect(page.getByText(new RegExp(`Oi, ${name}`, "i"))).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests: welcome screen
// ---------------------------------------------------------------------------

test.describe("Welcome screen", () => {
  test("shows the name input and start button", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder(/seu nome/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /começar|vamos lá|entrar/i })).toBeVisible();
  });

  test("does not proceed when name is empty", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /começar|vamos lá|entrar/i }).click();
    // Still on welcome screen — no chat messages container
    await expect(page.getByPlaceholder(/seu nome/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: chat flow — name > chat > send message > receive response
// ---------------------------------------------------------------------------

test.describe("Chat flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockChatApi(page);
  });

  test("shows a personalised welcome message after entering name", async ({ page }) => {
    await enterChat(page, "Lucas");
    await expect(page.getByText(/Oi, Lucas/i)).toBeVisible();
  });

  test("displays the app header with title", async ({ page }) => {
    await enterChat(page);
    await expect(page.getByRole("heading", { name: /Mamãe, me ajuda/i })).toBeVisible();
  });

  test("sends a text message and shows the AI response", async ({ page }) => {
    await enterChat(page);

    const chatInput = page.getByRole("textbox");
    await chatInput.fill("Quanto é 2+2?");
    await page.getByRole("button", { name: /enviar/i }).click();

    // User message should appear
    await expect(page.getByText("Quanto é 2+2?")).toBeVisible();

    // AI response should appear
    await expect(page.getByText(/Vamos pensar juntos/i)).toBeVisible();
  });

  test("clears the input after sending", async ({ page }) => {
    await enterChat(page);
    const chatInput = page.getByRole("textbox");
    await chatInput.fill("Minha dúvida");
    await page.getByRole("button", { name: /enviar/i }).click();
    await expect(chatInput).toHaveValue("");
  });

  test("send button is disabled while loading", async ({ page }) => {
    // Slow the mock response so we can observe loading state
    await page.route("**/api/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ response: "Resposta" }),
      });
    });

    await enterChat(page);
    const chatInput = page.getByRole("textbox");
    await chatInput.fill("Pergunta");
    const sendBtn = page.getByRole("button", { name: /enviar/i });
    await sendBtn.click();

    // Send button should be disabled while AI is responding
    await expect(sendBtn).toBeDisabled();
    // Wait for response to complete
    await expect(page.getByText("Resposta")).toBeVisible({ timeout: 5000 });
  });

  test("shows an error message on network failure", async ({ page }) => {
    await page.route("**/api/chat", (route) => route.abort());
    await enterChat(page);

    const chatInput = page.getByRole("textbox");
    await chatInput.fill("Pergunta");
    await page.getByRole("button", { name: /enviar/i }).click();

    await expect(page.getByText(/não consegui me conectar|erro|internet/i)).toBeVisible({
      timeout: 5000,
    });
  });
});
