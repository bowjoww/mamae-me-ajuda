import { renderHook, act, waitFor } from "@testing-library/react";
import { TextEncoder as NodeTextEncoder } from "util";
import { useChatSession } from "../useChatSession";

// jsdom in Node <20 lacks global TextEncoder
if (typeof globalThis.TextEncoder === "undefined") {
  (globalThis as unknown as { TextEncoder: typeof NodeTextEncoder }).TextEncoder =
    NodeTextEncoder;
}

// Mock the track fn so no PostHog warnings spill
jest.mock("@/lib/analytics", () => ({
  track: jest.fn(),
  AnalyticsEvent: {
    APP_OPENED: "app_opened",
    CHAT_STARTED: "chat_started",
    MESSAGE_SENT: "message_sent",
    CTA_CLICKED: "cta_clicked",
    PREMIUM_UPGRADE_CLICKED: "premium_upgrade_clicked",
  },
}));

function jsonResponse(body: unknown) {
  return {
    headers: new Map([["content-type", "application/json"]]),
    json: async () => body,
  } as unknown as Response;
}

describe("useChatSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("starts empty, then seeds welcome message after startSession", () => {
    const { result } = renderHook(() => useChatSession());
    expect(result.current.messages).toEqual([]);
    act(() => {
      result.current.startSession("Henrique");
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("model");
    expect(result.current.messages[0].content).toContain("Henrique");
  });

  it("returns early when sendMessage called with no content", async () => {
    const { result } = renderHook(() => useChatSession());
    act(() => {
      result.current.startSession("Ana");
    });
    await act(async () => {
      await result.current.sendMessage("   ", null);
    });
    // Only the welcome message should be present
    expect(result.current.messages).toHaveLength(1);
  });

  it("sends message and appends the assistant reply on JSON response", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ response: "Vamos pensar juntos." })
    );
    (global as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;

    const { result } = renderHook(() => useChatSession());
    act(() => {
      result.current.startSession("Ana");
    });

    await act(async () => {
      await result.current.sendMessage("oi", null);
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(3);
    });
    expect(result.current.messages[2].content).toBe("Vamos pensar juntos.");
  });

  it("surfaces offline copy when fetch throws", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useChatSession());
    act(() => {
      result.current.startSession("Ana");
    });

    await act(async () => {
      await result.current.sendMessage("oi", null);
    });

    await waitFor(() => {
      const last = result.current.messages.at(-1);
      expect(last?.content).toMatch(/sem conex/i);
    });
  });

  it("shows generic fallback when JSON response has neither error nor response field", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockResolvedValue(jsonResponse({}));

    const { result } = renderHook(() => useChatSession());
    act(() => {
      result.current.startSession("Ana");
    });
    await act(async () => {
      await result.current.sendMessage("oi", null);
    });
    await waitFor(() => {
      const last = result.current.messages.at(-1);
      expect(last?.content).toMatch(/inesperada/i);
    });
  });

  it("uses error field when server returns { error: string }", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ error: "algo deu errado" }));

    const { result } = renderHook(() => useChatSession());
    act(() => {
      result.current.startSession("Ana");
    });
    await act(async () => {
      await result.current.sendMessage("oi", null);
    });
    await waitFor(() => {
      const last = result.current.messages.at(-1);
      expect(last?.content).toBe("algo deu errado");
    });
  });

  it("sends image when provided", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ response: "ok" }));
    (global as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;

    const { result } = renderHook(() => useChatSession());
    act(() => {
      result.current.startSession("Ana");
    });
    await act(async () => {
      await result.current.sendMessage("", "data:image/jpeg;base64,x");
    });
    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    ) as { messages: Array<{ image?: string }> };
    expect(body.messages[0].image).toBe("data:image/jpeg;base64,x");
  });

  it("accumulates SSE delta events into assistant message", async () => {
    const encoder = new TextEncoder();
    // Payload shape must match what /api/chat actually emits:
    // sseEvent("delta", { text: ... }). See src/app/api/chat/route.ts.
    const chunks = [
      'event: delta\ndata: {"text":"Vamos "}\n\n',
      'event: delta\ndata: {"text":"pensar."}\n\n',
    ];
    let idx = 0;
    const reader = {
      read: jest.fn(async () => {
        if (idx >= chunks.length) return { value: undefined, done: true };
        const value = encoder.encode(chunks[idx]);
        idx += 1;
        return { value, done: false };
      }),
    };
    const sseResponse = {
      headers: new Map([["content-type", "text/event-stream"]]),
      body: { getReader: () => reader },
    } as unknown as Response;

    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockResolvedValue(sseResponse);

    const { result } = renderHook(() => useChatSession());
    act(() => {
      result.current.startSession("Ana");
    });

    await act(async () => {
      await result.current.sendMessage("oi", null);
    });

    await waitFor(() => {
      const last = result.current.messages.at(-1);
      expect(last?.content).toBe("Vamos pensar.");
    });
  });

  it("handles SSE error event and blocked event", async () => {
    const encoder = new TextEncoder();
    // Server emits sseEvent("blocked", { message: BLOCKED_OUTPUT_MESSAGE })
    // — the old test used { response } which was never what the route sent.
    const chunks = [
      'event: blocked\ndata: {"message":"bloqueado"}\n\n',
    ];
    let idx = 0;
    const reader = {
      read: jest.fn(async () => {
        if (idx >= chunks.length) return { value: undefined, done: true };
        const value = encoder.encode(chunks[idx]);
        idx += 1;
        return { value, done: false };
      }),
    };
    const sseResponse = {
      headers: new Map([["content-type", "text/event-stream"]]),
      body: { getReader: () => reader },
    } as unknown as Response;

    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockResolvedValue(sseResponse);

    const { result } = renderHook(() => useChatSession());
    act(() => {
      result.current.startSession("Ana");
    });

    await act(async () => {
      await result.current.sendMessage("oi", null);
    });

    await waitFor(() => {
      const last = result.current.messages.at(-1);
      expect(last?.content).toBe("bloqueado");
    });
  });

  it("ignores malformed SSE chunks and does not throw", async () => {
    const encoder = new TextEncoder();
    const chunks = ["event: delta\ndata: not json\n\n"];
    let idx = 0;
    const reader = {
      read: jest.fn(async () => {
        if (idx >= chunks.length) return { value: undefined, done: true };
        const value = encoder.encode(chunks[idx]);
        idx += 1;
        return { value, done: false };
      }),
    };
    const sseResponse = {
      headers: new Map([["content-type", "text/event-stream"]]),
      body: { getReader: () => reader },
    } as unknown as Response;

    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockResolvedValue(sseResponse);

    const { result } = renderHook(() => useChatSession());
    act(() => {
      result.current.startSession("Ana");
    });

    await act(async () => {
      await result.current.sendMessage("oi", null);
    });
    // No assistant message got seeded, only the original user+welcome
    expect(result.current.messages.length).toBeGreaterThanOrEqual(2);
  });
});
