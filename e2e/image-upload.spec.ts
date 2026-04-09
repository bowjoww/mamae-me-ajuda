import path from "path";
import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockChatApi(page: Page, response = "Vi uma imagem de exercício. Vamos pensar!") {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ response }),
    });
  });
}

async function enterChat(page: Page, name = "Pedro") {
  await page.goto("/");
  await page.getByPlaceholder(/seu nome/i).fill(name);
  await page.getByRole("button", { name: /começar|vamos lá|entrar/i }).click();
  await expect(page.getByText(new RegExp(`Oi, ${name}`, "i"))).toBeVisible();
}

/**
 * Sets a fake image file on the hidden file input.
 * A 1x1 transparent PNG is used to keep the payload small.
 */
async function uploadFakeImage(page: Page) {
  // Tiny 1x1 transparent PNG in base64
  const TINY_PNG_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "exercicio.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_B64, "base64"),
  });
}

// ---------------------------------------------------------------------------
// Tests: image upload > preview > send
// ---------------------------------------------------------------------------

test.describe("Image upload flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockChatApi(page);
    await enterChat(page);
  });

  test("shows an image preview after selecting a file", async ({ page }) => {
    await uploadFakeImage(page);
    // A preview image or thumbnail should appear above the input
    await expect(page.locator("img[alt]").or(page.getByRole("img"))).toBeVisible({ timeout: 3000 });
  });

  test("shows a remove button for the image preview", async ({ page }) => {
    await uploadFakeImage(page);
    // Some button to remove/cancel the image
    await expect(
      page.getByRole("button", { name: /remover|cancelar|×|fechar/i }).or(
        page.locator("[data-testid='remove-image']")
      )
    ).toBeVisible({ timeout: 3000 });
  });

  test("sends the message with the image attached", async ({ page }) => {
    await uploadFakeImage(page);

    const chatInput = page.getByRole("textbox");
    await chatInput.fill("O que é isso?");
    await page.getByRole("button", { name: /enviar/i }).click();

    // User message with image should appear, then AI response
    await expect(page.getByText("O que é isso?")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Vi uma imagem/i)).toBeVisible({ timeout: 5000 });
  });

  test("clears the image preview after sending", async ({ page }) => {
    await uploadFakeImage(page);
    const chatInput = page.getByRole("textbox");
    await chatInput.fill("Ajuda");
    await page.getByRole("button", { name: /enviar/i }).click();

    // After sending, the preview bar should be gone
    await expect(page.getByText(/Vi uma imagem/i)).toBeVisible({ timeout: 5000 });
    // No second preview image visible
    const previews = page.locator("[data-testid='image-preview-bar']");
    await expect(previews).toHaveCount(0);
  });

  test("removes the image preview when the remove button is clicked", async ({ page }) => {
    await uploadFakeImage(page);
    // Wait for the preview to appear
    await expect(page.locator("img[alt]").or(page.getByRole("img"))).toBeVisible({ timeout: 3000 });

    const removeBtn = page
      .getByRole("button", { name: /remover|cancelar|×|fechar/i })
      .or(page.locator("[data-testid='remove-image']"));
    await removeBtn.click();

    // Preview should disappear
    const previewBar = page.locator("[data-testid='image-preview-bar']");
    await expect(previewBar).toHaveCount(0);
  });
});
