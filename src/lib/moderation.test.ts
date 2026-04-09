import { moderateText } from "@/lib/moderation";

describe("moderateText", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("blocks known keyword content without calling OpenAI", async () => {
    const result = await moderateText({
      text: "isso e pornografia",
      scope: "input",
    });

    expect(result.blocked).toBe(true);
    expect(result.engine).toBe("keyword");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("allows safe content when OpenAI key is not configured", async () => {
    const result = await moderateText({
      text: "Pode me explicar fracao?",
      scope: "input",
    });

    expect(result.blocked).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("blocks content flagged by OpenAI moderation", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    (global.fetch as unknown as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            flagged: true,
            categories: {
              violence: true,
            },
          },
        ],
      }),
    });

    const result = await moderateText({
      text: "texto qualquer",
      scope: "output",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.blocked).toBe(true);
    expect(result.engine).toBe("openai");
    expect(result.categories).toContain("violence");
  });
});

