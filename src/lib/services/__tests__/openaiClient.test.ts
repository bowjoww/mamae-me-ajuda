/**
 * @jest-environment node
 */
import { getOpenAIClient, __resetOpenAIClient, callWithRetry } from "../openaiClient";

describe("getOpenAIClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    __resetOpenAIClient();
  });

  afterEach(() => {
    process.env = originalEnv;
    __resetOpenAIClient();
  });

  it("returns the same instance across calls (singleton)", () => {
    process.env.OPENAI_API_KEY = "sk-test-123";
    const a = getOpenAIClient();
    const b = getOpenAIClient();
    expect(a).toBe(b);
  });

  it("throws when OPENAI_API_KEY is not configured", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => getOpenAIClient()).toThrow(/OPENAI_API_KEY/);
  });
});

describe("callWithRetry", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("resolves on first success without retrying", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    const result = await callWithRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient errors with exponential backoff then succeeds", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValue("recovered");

    const promise = callWithRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    // Drain timers between awaits
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all retry attempts", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("persistent failure"));

    const promise = callWithRetry(fn, { maxAttempts: 2, baseDelayMs: 10 });
    const settled = promise.catch((e) => e);
    await jest.runAllTimersAsync();
    const err = await settled;

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/persistent failure/);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry on non-retryable errors (4xx)", async () => {
    const badReq = Object.assign(new Error("bad request"), { status: 400 });
    const fn = jest.fn().mockRejectedValue(badReq);

    const promise = callWithRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    const settled = promise.catch((e) => e);
    await jest.runAllTimersAsync();
    await settled;

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
