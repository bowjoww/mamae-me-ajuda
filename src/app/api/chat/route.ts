import * as Sentry from "@sentry/nextjs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatRatelimit, getClientIp } from "@/lib/ratelimit";
import {
  buildSystemPrompt,
  sanitizeStudentName,
  type SessionContext,
  type TutorMode,
} from "@/lib/chatUtils";
import { logBlockedModerationEvent, moderateText } from "@/lib/moderation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { askTutor, type TutorMessage } from "@/lib/services/aiTutor";

const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_HISTORY_MESSAGES = 10;
const BLOCKED_INPUT_MESSAGE =
  "Nao posso ajudar com esse tipo de conteudo. Vamos focar em uma duvida de estudos?";
const BLOCKED_OUTPUT_MESSAGE =
  "Desculpa, nao posso responder esse conteudo com seguranca. Vamos tentar outra pergunta de estudos?";

// ---------------------------------------------------------------------------
// Provider flag — `gemini` remains the default for safe rollback. Flipping
// AI_PROVIDER=openai enables GPT-5.1 via askTutor + SSE streaming.
// ---------------------------------------------------------------------------
type AiProvider = "gemini" | "openai";

function getAiProvider(): AiProvider {
  const raw = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  return raw === "openai" ? "openai" : "gemini";
}

// Exam-format hint for Modo Prova. Discursive is the Colégio Impacto default.
const examFormatSchema = z.enum(["discursive", "multiple-choice", "mixed"]);

const sessionContextSchema = z
  .object({
    subject: z.string().max(80).optional(),
    topic: z.string().max(200).optional(),
    examDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "examDate must be YYYY-MM-DD")
      .optional(),
    examFormat: examFormatSchema.optional(),
    topicsMastered: z.array(z.string().max(120)).max(30).optional(),
  })
  .strict()
  .optional();

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        content: z.string(),
        image: z.string().optional(),
      })
    )
    .min(1),
  studentName: z.string().max(50).default("estudante"),
  conversationId: z.string().uuid().optional(),
  mode: z.enum(["tarefa", "prova", "estudo"]).default("tarefa"),
  sessionContext: sessionContextSchema,
  stream: z.boolean().optional(),
});

interface ValidatedImage {
  mimeType: string;
  data: string;
}

function validateImageDataUrl(dataUrl: string): ValidatedImage | { error: string; status: number } {
  const matches = dataUrl.match(/^data:(image\/[\w+]+);base64,(.+)$/);
  if (!matches) {
    return { error: "Formato de imagem inválido.", status: 400 };
  }
  const mimeType = matches[1];
  if (!ALLOWED_IMAGE_MIMES.includes(mimeType as typeof ALLOWED_IMAGE_MIMES[number])) {
    return { error: "Tipo de imagem não suportado. Use JPEG, PNG, GIF ou WebP.", status: 400 };
  }
  const base64 = matches[2];
  const estimatedBytes = Math.ceil((base64.length * 3) / 4);
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return { error: "Imagem muito grande. O tamanho máximo é 5MB.", status: 400 };
  }
  return { mimeType, data: base64 };
}

async function callGemini(args: {
  messages: Array<{ role: "user" | "model"; content: string; image?: string }>;
  studentName: string;
  mode: TutorMode;
  sessionContext?: SessionContext;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("gemini_key_missing");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: {
      role: "user",
      parts: [
        {
          text: buildSystemPrompt(args.studentName, args.mode, args.sessionContext),
        },
      ],
    },
  });

  const history = args.messages.slice(0, -1).map((msg) => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }],
  }));

  const lastMessage = args.messages[args.messages.length - 1];
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (lastMessage.image) {
    const matches = lastMessage.image.match(/^data:(image\/[\w+]+);base64,(.+)$/);
    if (matches) {
      parts.push({
        inlineData: { mimeType: matches[1], data: matches[2] },
      });
    }
  }
  parts.push({
    text: lastMessage.content || "O que você vê nesta imagem? Me ajude a entender o exercício.",
  });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(parts);
  return result.response.text();
}

async function persistMessages(params: {
  conversationId: string;
  userContent: string;
  modelContent: string;
  hasImage: boolean;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", params.conversationId)
    .eq("parent_id", user.id)
    .single();
  if (!conversation) return;

  await supabase.from("messages").insert([
    {
      conversation_id: params.conversationId,
      role: "user" as const,
      content: params.userContent,
      has_image: params.hasImage,
    },
    {
      conversation_id: params.conversationId,
      role: "model" as const,
      content: params.modelContent,
      has_image: false,
    },
  ]);
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.conversationId);
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting (preserved from Gemini path). Runs before auth so that
    // unauthenticated scanners still get throttled.
    if (chatRatelimit) {
      const ip = getClientIp(req);
      const { success } = await chatRatelimit.limit(ip);
      if (!success) {
        return NextResponse.json(
          { error: "Muitas requisições. Aguarde um momento e tente novamente." },
          { status: 429 }
        );
      }
    }

    // Cost-abuse defense lives in the Upstash rate-limiter above, not in an
    // auth gate — /api/chat must work for unauthenticated users because the
    // signup flow (Google OAuth) is still being wired and the core product
    // (socratic chat) should not block on auth. v1.1 restores auth here once
    // OAuth is live and the client auto-signs users in on consent accept.

    const provider = getAiProvider();

    // Provider readiness check — keep the same 500 shape as before for legacy
    // tests that assert "returns 500 when GEMINI_API_KEY is missing".
    if (provider === "gemini" && !process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Chave da API não configurada." },
        { status: 500 }
      );
    }
    if (provider === "openai" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Chave da API não configurada." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos na requisição." },
        { status: 400 }
      );
    }

    const {
      messages,
      studentName: rawName,
      conversationId,
      mode,
      sessionContext,
      stream: wantsStream,
    } = parsed.data;
    const studentName = sanitizeStudentName(rawName);

    const cappedMessages = messages.slice(-MAX_HISTORY_MESSAGES);
    const lastMessage = cappedMessages[cappedMessages.length - 1];
    if (lastMessage.role !== "user") {
      return NextResponse.json(
        { error: "A ultima mensagem precisa ser enviada pelo usuario." },
        { status: 400 }
      );
    }

    if (lastMessage.image) {
      const imgCheck = validateImageDataUrl(lastMessage.image);
      if ("error" in imgCheck) {
        return NextResponse.json({ error: imgCheck.error }, { status: imgCheck.status });
      }
    }

    const requestId = req.headers.get("x-request-id");
    const inputModeration = await moderateText({
      text: lastMessage.content,
      scope: "input",
    });

    if (inputModeration.blocked) {
      logBlockedModerationEvent({
        scope: "input",
        engine: inputModeration.engine ?? "keyword",
        categories: inputModeration.categories,
        textLength: lastMessage.content.length,
        hasImage: Boolean(lastMessage.image),
        requestId,
      });
      return NextResponse.json(
        { error: BLOCKED_INPUT_MESSAGE, blocked: true },
        { status: 200 }
      );
    }

    // ------------------------------------------------------------------
    // Provider dispatch
    // ------------------------------------------------------------------
    if (provider === "gemini") {
      const text = await callGemini({
        messages: cappedMessages,
        studentName,
        mode,
        sessionContext,
      });

      const outputModeration = await moderateText({ text, scope: "output" });
      if (outputModeration.blocked) {
        logBlockedModerationEvent({
          scope: "output",
          engine: outputModeration.engine ?? "keyword",
          categories: outputModeration.categories,
          textLength: text.length,
          hasImage: false,
          requestId,
        });
        return NextResponse.json({ response: BLOCKED_OUTPUT_MESSAGE, blocked: true });
      }

      if (conversationId) {
        await persistMessages({
          conversationId,
          userContent: lastMessage.content,
          modelContent: text,
          hasImage: Boolean(lastMessage.image),
        });
      }
      return NextResponse.json({ response: text });
    }

    // OpenAI path ------------------------------------------------------
    const tutorMessages: TutorMessage[] = cappedMessages.map((m) => ({
      role: m.role,
      content: m.content,
      image: m.image,
    }));

    if (wantsStream) {
      // SSE — we moderate the aggregate text at the very end, before the `done`
      // event, so a blocked output still reaches the client but carries the
      // sanitised fallback message.
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder();
          let aggregate = "";
          try {
            const result = await askTutor({
              mode,
              studentName,
              sessionContext,
              messages: tutorMessages,
              stream: true,
            });
            for await (const evt of result.stream) {
              if (evt.type === "delta") {
                aggregate += evt.text;
                controller.enqueue(encoder.encode(sseEvent("delta", { text: evt.text })));
              } else if (evt.type === "done") {
                const outputModeration = await moderateText({
                  text: aggregate,
                  scope: "output",
                });
                if (outputModeration.blocked) {
                  logBlockedModerationEvent({
                    scope: "output",
                    engine: outputModeration.engine ?? "keyword",
                    categories: outputModeration.categories,
                    textLength: aggregate.length,
                    hasImage: false,
                    requestId,
                  });
                  controller.enqueue(
                    encoder.encode(
                      sseEvent("blocked", { message: BLOCKED_OUTPUT_MESSAGE })
                    )
                  );
                  aggregate = BLOCKED_OUTPUT_MESSAGE;
                } else if (conversationId) {
                  await persistMessages({
                    conversationId,
                    userContent: lastMessage.content,
                    modelContent: aggregate,
                    hasImage: Boolean(lastMessage.image),
                  });
                }
                controller.enqueue(
                  encoder.encode(
                    sseEvent("done", {
                      modelUsed: evt.modelUsed,
                      total_tokens: evt.tokens.total,
                    })
                  )
                );
              }
            }
          } catch (err) {
            Sentry.captureException(err, { tags: { endpoint: "chat", provider: "openai" } });
            controller.enqueue(
              encoder.encode(
                sseEvent("error", { message: "Ops! Algo deu errado. Tente novamente." })
              )
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // Non-streaming OpenAI
    const result = await askTutor({
      mode,
      studentName,
      sessionContext,
      messages: tutorMessages,
      stream: false,
    });
    const text = result.text;

    const outputModeration = await moderateText({ text, scope: "output" });
    if (outputModeration.blocked) {
      logBlockedModerationEvent({
        scope: "output",
        engine: outputModeration.engine ?? "keyword",
        categories: outputModeration.categories,
        textLength: text.length,
        hasImage: false,
        requestId,
      });
      return NextResponse.json({ response: BLOCKED_OUTPUT_MESSAGE, blocked: true });
    }

    if (conversationId) {
      await persistMessages({
        conversationId,
        userContent: lastMessage.content,
        modelContent: text,
        hasImage: Boolean(lastMessage.image),
      });
    }
    return NextResponse.json({ response: text });
  } catch (error) {
    // Surface error message to Vercel runtime logs so we can diagnose
    // without Sentry. Sentry keeps capturing for forensics, but the catch
    // block was previously silent which made root-cause invisible during
    // Henrique's real-use sessions (chat would fail with no log line).
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error("[chat_error]", {
      name,
      message: message.slice(0, 500),
      // Stack helps pinpoint provider vs moderation vs persistence layer
      stack:
        error instanceof Error && error.stack
          ? error.stack.split("\n").slice(0, 5).join("\n")
          : undefined,
    });
    Sentry.captureException(error, {
      tags: { endpoint: "chat" },
      // LGPD: deliberately omit user data / studentName from context
    });

    // Map common provider errors to kid-friendly 429 instead of opaque 500
    // so the client surfaces "wait a moment" instead of "something broke".
    // Gemini SDK throws errors whose messages contain "quota", "rate",
    // "429", or "RESOURCE_EXHAUSTED" when free-tier limits are hit.
    const lower = message.toLowerCase();
    const isQuotaOrRate =
      lower.includes("quota") ||
      lower.includes("rate limit") ||
      lower.includes("429") ||
      lower.includes("resource_exhausted") ||
      lower.includes("too many requests");
    if (isQuotaOrRate) {
      return NextResponse.json(
        {
          error:
            "A tutora deu uma pausa pra respirar. Tenta de novo daqui a 1 minuto.",
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Ops! Algo deu errado. Tente novamente em alguns segundos." },
      { status: 500 }
    );
  }
}
