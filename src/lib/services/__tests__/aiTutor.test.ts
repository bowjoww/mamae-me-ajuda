/**
 * @jest-environment node
 */
import type { TutorMessage } from "../aiTutor";

// --------------------------------------------------------------------------
// Mocks — we intercept the openai client *before* importing aiTutor.
// --------------------------------------------------------------------------

const mockResponsesCreate = jest.fn();
// Note: the `..._args` rest param is what lets TSC accept the spread call
// below. Without it, jest.fn infers a 0-arg signature and TS2556 fires.
const mockGetOpenAIClient = jest.fn((..._args: unknown[]) => ({
  responses: { create: mockResponsesCreate },
}));

jest.mock("../openaiClient", () => ({
  getOpenAIClient: (...args: unknown[]) => mockGetOpenAIClient(...args),
  callWithRetry: (fn: () => Promise<unknown>) => fn(),
  __resetOpenAIClient: jest.fn(),
}));

// Re-import after mocks.
/* eslint-disable @typescript-eslint/no-require-imports */
const aiTutor = require("../aiTutor") as typeof import("../aiTutor");
/* eslint-enable @typescript-eslint/no-require-imports */

const { askTutor, buildResponsesInput } = aiTutor;

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

const simpleHistory: TutorMessage[] = [
  { role: "user", content: "Como faço para entender fração?" },
  { role: "model", content: "Vamos pensar juntos! O que você já sabe sobre partes de um todo?" },
  { role: "user", content: "Não sei nada ainda" },
];

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("buildResponsesInput", () => {
  it("converts 'model' role to 'assistant' for OpenAI", () => {
    const input = buildResponsesInput(simpleHistory);
    expect(input).toHaveLength(3);
    expect(input[0].role).toBe("user");
    expect(input[1].role).toBe("assistant");
    expect(input[2].role).toBe("user");
  });

  it("keeps 'user' role untouched", () => {
    const input = buildResponsesInput([{ role: "user", content: "oi" }]);
    expect(input[0].role).toBe("user");
  });

  it("embeds image as input_image when present on last user message", () => {
    const withImage: TutorMessage[] = [
      {
        role: "user",
        content: "Olha esse exercício",
        image: "data:image/jpeg;base64,ABC123",
      },
    ];
    const input = buildResponsesInput(withImage);
    expect(input[0].content).toEqual([
      { type: "input_image", image_url: "data:image/jpeg;base64,ABC123", detail: "auto" },
      { type: "input_text", text: "Olha esse exercício" },
    ]);
  });

  it("uses plain string content when no image is attached", () => {
    const input = buildResponsesInput([{ role: "user", content: "texto simples" }]);
    expect(input[0].content).toBe("texto simples");
  });
});

describe("askTutor (non-streaming)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = "sk-test";
  });

  it("calls responses.create with the configured primary model", async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      output_text: "Resposta guiada",
      usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
    });

    const result = await askTutor({
      mode: "tarefa",
      studentName: "Ana",
      messages: simpleHistory,
      stream: false,
    });

    expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
    const args = mockResponsesCreate.mock.calls[0][0];
    expect(args.model).toMatch(/^gpt-5/);
    expect(args.stream).toBe(false);
    expect(args.instructions).toContain("Ana");
    expect(args.instructions).toContain("NUNCA dê a resposta direta");
    expect(args.reasoning).toEqual({ effort: "medium" });
    expect(result.text).toBe("Resposta guiada");
    expect(result.tokens).toEqual({ input: 100, output: 20, total: 120 });
  });

  it("includes sessionContext (subject/topic) in instructions when provided", async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      output_text: "ok",
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    });

    await askTutor({
      mode: "prova",
      studentName: "Lucas",
      sessionContext: {
        subject: "Matemática",
        topic: "Equações do 1º grau",
        examDate: "2026-05-10",
      },
      messages: [{ role: "user", content: "Me ajuda a estudar" }],
      stream: false,
    });

    const args = mockResponsesCreate.mock.calls[0][0];
    expect(args.instructions).toContain("Matemática");
    expect(args.instructions).toContain("Equações do 1º grau");
  });

  it("raises reasoning.effort to 'high' when mode is 'prova'", async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      output_text: "ok",
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    });

    await askTutor({
      mode: "prova",
      studentName: "x",
      messages: [{ role: "user", content: "q" }],
      stream: false,
    });

    const args = mockResponsesCreate.mock.calls[0][0];
    expect(args.reasoning.effort).toBe("high");
  });

  it("falls back to the secondary model when primary fails", async () => {
    mockResponsesCreate
      .mockRejectedValueOnce(Object.assign(new Error("server error"), { status: 503 }))
      .mockResolvedValueOnce({
        output_text: "fallback response",
        usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
      });

    const result = await askTutor({
      mode: "tarefa",
      studentName: "x",
      messages: [{ role: "user", content: "q" }],
      stream: false,
    });

    expect(mockResponsesCreate).toHaveBeenCalledTimes(2);
    const firstCall = mockResponsesCreate.mock.calls[0][0];
    const secondCall = mockResponsesCreate.mock.calls[1][0];
    expect(firstCall.model).not.toBe(secondCall.model);
    expect(result.text).toBe("fallback response");
    expect(result.modelUsed).toBe(secondCall.model);
  });
});

describe("askTutor (streaming)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = "sk-test";
  });

  it("yields text deltas from response.output_text.delta events", async () => {
    mockResponsesCreate.mockResolvedValueOnce(
      (async function* () {
        yield { type: "response.created" };
        yield { type: "response.output_text.delta", delta: "Vamos " };
        yield { type: "response.output_text.delta", delta: "pensar " };
        yield { type: "response.output_text.delta", delta: "juntos!" };
        yield {
          type: "response.completed",
          response: { usage: { input_tokens: 50, output_tokens: 10, total_tokens: 60 } },
        };
      })()
    );

    const result = await askTutor({
      mode: "tarefa",
      studentName: "x",
      messages: [{ role: "user", content: "q" }],
      stream: true,
    });

    const chunks: string[] = [];
    let finalTokens: { input: number; output: number; total: number } | null = null;
    for await (const evt of result.stream) {
      if (evt.type === "delta") chunks.push(evt.text);
      if (evt.type === "done") finalTokens = evt.tokens;
    }

    expect(chunks).toEqual(["Vamos ", "pensar ", "juntos!"]);
    expect(finalTokens).toEqual({ input: 50, output: 10, total: 60 });
  });

  it("passes stream:true to responses.create", async () => {
    mockResponsesCreate.mockResolvedValueOnce(
      (async function* () {
        yield {
          type: "response.completed",
          response: { usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } },
        };
      })()
    );

    const result = await askTutor({
      mode: "tarefa",
      studentName: "x",
      messages: [{ role: "user", content: "q" }],
      stream: true,
    });
    // Consume the iterator
    for await (const _ of result.stream) {
      void _;
    }

    expect(mockResponsesCreate.mock.calls[0][0].stream).toBe(true);
  });
});
