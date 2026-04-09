/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { POST } from "../chat/route";
import * as moderationModule from "@/lib/moderation";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock ratelimit so no Redis connection is needed.
jest.mock("@/lib/ratelimit", () => ({
  chatRatelimit: null,
  ttsRatelimit: null,
  getClientIp: () => "127.0.0.1",
}));

// Mock moderation so no OpenAI moderation call is made.
jest.mock("@/lib/moderation", () => ({
  moderateText: jest.fn().mockResolvedValue({ blocked: false, scope: "input" }),
  logBlockedModerationEvent: jest.fn(),
}));

// Mock the Gemini SDK.
const mockSendMessage = jest.fn();
const mockStartChat = jest.fn(() => ({ sendMessage: mockSendMessage }));
const mockGetGenerativeModel = jest.fn(() => ({ startChat: mockStartChat }));

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  messages: [{ role: "user", content: "Qual é 2+2?" }],
  studentName: "Ana",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/chat", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, GEMINI_API_KEY: "test-gemini-key" };
    mockSendMessage.mockResolvedValue({
      response: { text: () => "Vamos pensar juntos! Quanto é 2 e mais 2?" },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it("returns 500 when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toMatch(/configurada/i);
  });

  it("returns 400 when the request body is invalid (no messages)", async () => {
    const res = await POST(makeRequest({ studentName: "Test" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/inválidos/i);
  });

  it("returns 400 when messages array is empty", async () => {
    const res = await POST(makeRequest({ messages: [], studentName: "Test" }));
    const json = await res.json();
    expect(res.status).toBe(400);
  });

  it("returns 400 when the last message is not from the user", async () => {
    const res = await POST(
      makeRequest({
        messages: [{ role: "model", content: "Olá!" }],
        studentName: "Test",
      })
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/usuario/i);
  });

  it("returns a successful response with Gemini output", async () => {
    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.response).toBe("Vamos pensar juntos! Quanto é 2 e mais 2?");
  });

  it("passes studentName to the system prompt builder", async () => {
    await POST(makeRequest(VALID_BODY));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArgs = (mockGetGenerativeModel.mock.calls as any[][])[0][0];
    const systemText = callArgs.systemInstruction.parts[0].text;
    expect(systemText).toContain("Ana");
  });

  it("returns 400 for an invalid image format", async () => {
    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "Veja", image: "not-a-valid-data-url" }],
        studentName: "Test",
      })
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/imagem/i);
  });

  it("returns 400 for an unsupported image MIME type", async () => {
    const res = await POST(
      makeRequest({
        messages: [
          {
            role: "user",
            content: "Veja",
            image: "data:image/bmp;base64,AAAAA",
          },
        ],
        studentName: "Test",
      })
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/tipo de imagem/i);
  });

  it("caps conversation history to the last 10 messages", async () => {
    const manyMessages = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "model",
      content: `Mensagem ${i}`,
    }));
    // Ensure last message is user
    manyMessages.push({ role: "user", content: "Última pergunta" });

    const res = await POST(makeRequest({ messages: manyMessages, studentName: "Test" }));
    expect(res.status).toBe(200);

    // The history passed to startChat should be at most MAX_HISTORY_MESSAGES - 1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const historyPassed = (mockStartChat.mock.calls as any[][])[0][0].history;
    expect(historyPassed.length).toBeLessThanOrEqual(9);
  });

  it("returns 500 and error message when Gemini throws", async () => {
    mockSendMessage.mockRejectedValue(new Error("Gemini failure"));
    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toMatch(/algo deu errado/i);
  });

  it("returns blocked:true and no AI call when moderation blocks input", async () => {
    (moderationModule.moderateText as jest.Mock).mockResolvedValueOnce({
      blocked: true,
      scope: "input",
      engine: "keyword",
      categories: ["keyword_match"],
    });

    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.blocked).toBe(true);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
