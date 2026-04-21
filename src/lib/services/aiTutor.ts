/**
 * Provider-agnostic tutor abstraction.
 *
 * Calls OpenAI's Responses API (gpt-5.1 family) with a 2-level model fallback
 * chain (primary → mini). The caller receives either a full text result or a
 * streaming async iterator of text deltas — the Socratic prompt lives in
 * `chatUtils.buildSystemPrompt` and is injected as the `instructions` field.
 *
 * LGPD: we never log message content. Only token counts + model id are sent
 * to telemetry.
 */
import { buildSystemPrompt, type TutorMode, type SessionContext } from "@/lib/chatUtils";
import { callWithRetry, getOpenAIClient } from "./openaiClient";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TutorRole = "user" | "model";

export interface TutorMessage {
  role: TutorRole;
  content: string;
  image?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface AskTutorBaseArgs {
  mode: TutorMode;
  studentName: string;
  sessionContext?: SessionContext;
  messages: TutorMessage[];
}

export type AskTutorNonStreamResult = {
  text: string;
  modelUsed: string;
  tokens: TokenUsage;
};

export type AskTutorStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; tokens: TokenUsage; modelUsed: string };

export type AskTutorStreamResult = {
  stream: AsyncIterable<AskTutorStreamEvent>;
  modelUsed: string;
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Confirmed via context7 + developers.openai.com/api (April 2026):
// gpt-5.1 and gpt-5.1-mini are still first-class Responses API models even
// though they have been retired from the ChatGPT product surface.
export const OPENAI_PRIMARY_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.1";
export const OPENAI_FALLBACK_MODEL =
  process.env.OPENAI_MODEL_FALLBACK ?? "gpt-5.1-mini";

const REASONING_EFFORT_BY_MODE: Record<TutorMode, "low" | "medium" | "high"> = {
  tarefa: "medium", // default — quick homework help
  estudo: "medium", // ongoing study session
  prova: "high", // exam prep benefits from deeper reasoning
};

// ---------------------------------------------------------------------------
// Input builder
// ---------------------------------------------------------------------------

interface ResponsesTextPart {
  type: "input_text";
  text: string;
}

interface ResponsesImagePart {
  type: "input_image";
  image_url: string;
  detail: "auto" | "low" | "high";
}

type ResponsesContent = string | Array<ResponsesTextPart | ResponsesImagePart>;

export interface ResponsesInputMessage {
  role: "user" | "assistant";
  content: ResponsesContent;
}

export function buildResponsesInput(messages: TutorMessage[]): ResponsesInputMessage[] {
  return messages.map((msg) => {
    const role: "user" | "assistant" = msg.role === "model" ? "assistant" : "user";

    if (msg.image && role === "user") {
      return {
        role,
        content: [
          {
            type: "input_image" as const,
            image_url: msg.image,
            detail: "auto" as const,
          },
          {
            type: "input_text" as const,
            text: msg.content || "O que você vê nesta imagem? Me ajude a entender o exercício.",
          },
        ],
      };
    }

    return { role, content: msg.content };
  });
}

// ---------------------------------------------------------------------------
// Telemetry (LGPD-safe — never logs content)
// ---------------------------------------------------------------------------

interface TelemetryPayload {
  model: string;
  mode: TutorMode;
  tokens: TokenUsage;
  streamed: boolean;
  fallbackUsed: boolean;
}

function emitTelemetry(payload: TelemetryPayload): void {
  // Server-side logging only — PostHog capture happens in the route via the
  // existing analytics module, which already avoids content leakage.
  // We stick to console.info here so Sentry breadcrumbs pick it up.
  console.info("[ai_request]", {
    model: payload.model,
    mode: payload.mode,
    input_tokens: payload.tokens.input,
    output_tokens: payload.tokens.output,
    total_tokens: payload.tokens.total,
    streamed: payload.streamed,
    fallback_used: payload.fallbackUsed,
  });
}

// ---------------------------------------------------------------------------
// Core implementations
// ---------------------------------------------------------------------------

interface ResponsesCreateParams {
  model: string;
  instructions: string;
  input: ResponsesInputMessage[];
  stream: boolean;
  reasoning: { effort: "low" | "medium" | "high" };
  // CISO blocker: disable server-side training storage on every OpenAI call.
  store: false;
}

function buildParams(args: AskTutorBaseArgs, model: string, stream: boolean): ResponsesCreateParams {
  return {
    model,
    instructions: buildSystemPrompt(args.studentName, args.mode, args.sessionContext),
    input: buildResponsesInput(args.messages),
    stream,
    reasoning: { effort: REASONING_EFFORT_BY_MODE[args.mode] },
    store: false,
  };
}

async function createWithFallback<T>(
  stream: boolean,
  args: AskTutorBaseArgs,
  handler: (result: unknown, modelUsed: string, fallbackUsed: boolean) => T
): Promise<T> {
  const client = getOpenAIClient();
  const models = [OPENAI_PRIMARY_MODEL, OPENAI_FALLBACK_MODEL];

  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const params = buildParams(args, model, stream);
      // Retry only non-stream calls; streaming retries would double-deliver tokens.
      const result = stream
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (client.responses.create as any)(params)
        : await callWithRetry(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            () => (client.responses.create as any)(params),
            { maxAttempts: 2 }
          );
      return handler(result, model, i > 0);
    } catch (err) {
      lastErr = err;
      // Try the fallback model on any error other than 4xx auth issues.
      const status = (err as { status?: number })?.status;
      if (typeof status === "number" && status >= 400 && status < 500 && status !== 429) {
        throw err;
      }
      continue;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Public entrypoints
// ---------------------------------------------------------------------------

export async function askTutor(
  args: AskTutorBaseArgs & { stream: false }
): Promise<AskTutorNonStreamResult>;
export async function askTutor(
  args: AskTutorBaseArgs & { stream: true }
): Promise<AskTutorStreamResult>;
export async function askTutor(
  args: AskTutorBaseArgs & { stream: boolean }
): Promise<AskTutorNonStreamResult | AskTutorStreamResult> {
  if (args.stream) {
    return createWithFallback(true, args, (result, modelUsed, fallbackUsed) => {
      const iter = result as AsyncIterable<unknown>;
      return {
        modelUsed,
        stream: consumeStream(iter, modelUsed, args.mode, fallbackUsed),
      };
    });
  }

  return createWithFallback(false, args, (result, modelUsed, fallbackUsed) => {
    const r = result as {
      output_text?: string;
      usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    };
    const tokens = {
      input: r.usage?.input_tokens ?? 0,
      output: r.usage?.output_tokens ?? 0,
      total: r.usage?.total_tokens ?? 0,
    };
    emitTelemetry({
      model: modelUsed,
      mode: args.mode,
      tokens,
      streamed: false,
      fallbackUsed,
    });
    return {
      text: r.output_text ?? "",
      modelUsed,
      tokens,
    };
  });
}

/**
 * Structured JSON extraction via OpenAI Responses API.
 * Used by studyPlanService and flashcardService to parse intent / generate
 * cards without leaking free-form text. Does not store conversation data.
 *
 * LGPD note: the schema is provided upstream; we never log the raw text.
 */
export async function askStructured<T>(args: {
  studentName: string;
  mode: TutorMode;
  systemAddendum?: string;
  userPrompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  sessionContext?: SessionContext;
}): Promise<{ data: T; modelUsed: string; tokens: TokenUsage }> {
  const client = getOpenAIClient();
  const models = [OPENAI_PRIMARY_MODEL, OPENAI_FALLBACK_MODEL];

  const instructions = [
    buildSystemPrompt(args.studentName, args.mode, args.sessionContext),
    args.systemAddendum ?? "",
    "\n\nIMPORTANTE: Responda EXCLUSIVAMENTE em JSON válido que siga o schema fornecido.",
  ]
    .filter(Boolean)
    .join("");

  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const params = {
        model,
        instructions,
        input: [{ role: "user" as const, content: args.userPrompt }],
        reasoning: { effort: REASONING_EFFORT_BY_MODE[args.mode] },
        store: false as const,
        text: {
          format: {
            type: "json_schema" as const,
            name: args.schemaName,
            schema: args.jsonSchema,
            strict: true,
          },
        },
      };
      const result = await callWithRetry(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => (client.responses.create as any)(params),
        { maxAttempts: 2 }
      );
      const r = result as {
        output_text?: string;
        usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
      };
      const raw = r.output_text ?? "";
      let parsed: T;
      try {
        parsed = JSON.parse(raw) as T;
      } catch {
        throw new Error("ai_structured_parse_error");
      }
      const tokens: TokenUsage = {
        input: r.usage?.input_tokens ?? 0,
        output: r.usage?.output_tokens ?? 0,
        total: r.usage?.total_tokens ?? 0,
      };
      emitTelemetry({
        model,
        mode: args.mode,
        tokens,
        streamed: false,
        fallbackUsed: i > 0,
      });
      return { data: parsed, modelUsed: model, tokens };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (typeof status === "number" && status >= 400 && status < 500 && status !== 429) {
        throw err;
      }
      continue;
    }
  }
  throw lastErr;
}

async function* consumeStream(
  iter: AsyncIterable<unknown>,
  modelUsed: string,
  mode: TutorMode,
  fallbackUsed: boolean
): AsyncGenerator<AskTutorStreamEvent, void, unknown> {
  let tokens: TokenUsage = { input: 0, output: 0, total: 0 };

  for await (const raw of iter) {
    const evt = raw as {
      type?: string;
      delta?: string;
      response?: {
        usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
      };
    };

    if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
      yield { type: "delta", text: evt.delta };
    } else if (evt.type === "response.completed") {
      const usage = evt.response?.usage;
      tokens = {
        input: usage?.input_tokens ?? 0,
        output: usage?.output_tokens ?? 0,
        total: usage?.total_tokens ?? 0,
      };
    }
  }

  emitTelemetry({
    model: modelUsed,
    mode,
    tokens,
    streamed: true,
    fallbackUsed,
  });

  yield { type: "done", tokens, modelUsed };
}
