/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { POST } from "../tts/route";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock("@/lib/ratelimit", () => ({
  chatRatelimit: null,
  ttsRatelimit: null,
  getClientIp: () => "127.0.0.1",
}));

// Mock Supabase server client — TTS now requires an authenticated user so that
// anon traffic cannot burn OpenAI credits. Default: authenticated user.
jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: "test-user-id" } } }),
    },
  }),
}));

// Access to the mocked module for tests that override user state.
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4]).buffer;

function mockOpenAISuccess(arrayBuffer: ArrayBuffer = AUDIO_BYTES) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => arrayBuffer,
  } as unknown as Response);
}

function mockOpenAIFailure(status = 500, body = "Internal Server Error") {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => body,
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/tts", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: "test-openai-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it("returns 401 when unauthenticated (prevents OpenAI cost abuse)", async () => {
    // Override the default supabase mock to return no user.
    (createSupabaseServerClient as jest.Mock).mockResolvedValueOnce({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      },
    });
    // Install a fetch spy so we can assert OpenAI is never called. The test
    // must fail if auth slips through, so this assertion needs a real mock.
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof global.fetch;
    const res = await POST(makeRequest({ text: "Olá!" }));
    expect(res.status).toBe(401);
    // Proof: OpenAI is never called when auth fails.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 500 when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await POST(makeRequest({ text: "Olá!" }));
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toMatch(/voz/i);
  });

  it("returns 400 when text field is missing", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/inválido/i);
  });

  it("returns 400 when text is empty string", async () => {
    const res = await POST(makeRequest({ text: "" }));
    const json = await res.json();
    expect(res.status).toBe(400);
  });

  it("returns audio/mpeg content on success", async () => {
    mockOpenAISuccess();
    const res = await POST(makeRequest({ text: "Explique frações." }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
  });

  it("calls OpenAI TTS API with correct parameters", async () => {
    mockOpenAISuccess();
    await POST(makeRequest({ text: "Explique frações." }));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    const body = JSON.parse(options.body as string);
    expect(body.voice).toBe("nova");
    expect(body.model).toBe("tts-1");
  });

  it("strips markdown bold from text before sending to OpenAI", async () => {
    mockOpenAISuccess();
    await POST(makeRequest({ text: "**Frações** são *importantes*." }));

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.input).toBe("Frações são importantes.");
  });

  it("returns 500 when OpenAI returns an error", async () => {
    mockOpenAIFailure();
    const res = await POST(makeRequest({ text: "Olá!" }));
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toMatch(/áudio/i);
  });

  it("returns 500 when fetch throws (network error)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));
    const res = await POST(makeRequest({ text: "Olá!" }));
    const json = await res.json();
    expect(res.status).toBe(500);
  });

  it("includes cache-control header in successful response", async () => {
    mockOpenAISuccess();
    const res = await POST(makeRequest({ text: "Olá!" }));
    expect(res.headers.get("cache-control")).toMatch(/max-age/);
  });
});
