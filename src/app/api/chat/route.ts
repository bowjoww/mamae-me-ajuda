import * as Sentry from "@sentry/nextjs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatRatelimit, getClientIp } from "@/lib/ratelimit";
import { buildSystemPrompt, sanitizeStudentName } from "@/lib/chatUtils";
import { logBlockedModerationEvent, moderateText } from "@/lib/moderation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_HISTORY_MESSAGES = 10;
const BLOCKED_INPUT_MESSAGE =
  "Nao posso ajudar com esse tipo de conteudo. Vamos focar em uma duvida de estudos?";
const BLOCKED_OUTPUT_MESSAGE =
  "Desculpa, nao posso responder esse conteudo com seguranca. Vamos tentar outra pergunta de estudos?";

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
});


export async function POST(req: NextRequest) {
  try {
    // Rate limiting
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Chave da API não configurada." },
        { status: 500 }
      );
    }

    // Zod validation
    const body = await req.json();
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos na requisição." },
        { status: 400 }
      );
    }

    const { messages, studentName: rawName, conversationId } = parsed.data;
    const studentName = sanitizeStudentName(rawName);

    // Cap history to last MAX_HISTORY_MESSAGES messages
    const cappedMessages = messages.slice(-MAX_HISTORY_MESSAGES);

    const lastMessage = cappedMessages[cappedMessages.length - 1];
    if (lastMessage.role !== "user") {
      return NextResponse.json(
        { error: "A ultima mensagem precisa ser enviada pelo usuario." },
        { status: 400 }
      );
    }

    // Validate image MIME type and size
    if (lastMessage.image) {
      const matches = lastMessage.image.match(/^data:(image\/[\w+]+);base64,(.+)$/);
      if (!matches) {
        return NextResponse.json(
          { error: "Formato de imagem inválido." },
          { status: 400 }
        );
      }
      const mimeType = matches[1] as string;
      if (!ALLOWED_IMAGE_MIMES.includes(mimeType as typeof ALLOWED_IMAGE_MIMES[number])) {
        return NextResponse.json(
          { error: "Tipo de imagem não suportado. Use JPEG, PNG, GIF ou WebP." },
          { status: 400 }
        );
      }
      const base64Data = matches[2];
      const estimatedBytes = Math.ceil((base64Data.length * 3) / 4);
      if (estimatedBytes > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "Imagem muito grande. O tamanho máximo é 5MB." },
          { status: 400 }
        );
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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: {
        role: "user",
        parts: [{ text: buildSystemPrompt(studentName) }],
      },
    });

    // Build conversation history (all but last message)
    const history = cappedMessages.slice(0, -1).map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    // Build parts for last message
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    if (lastMessage.image) {
      const matches = lastMessage.image.match(/^data:(image\/[\w+]+);base64,(.+)$/);
      if (matches) {
        parts.push({
          inlineData: {
            mimeType: matches[1],
            data: matches[2],
          },
        });
      }
    }

    parts.push({
      text: lastMessage.content || "O que você vê nesta imagem? Me ajude a entender o exercício.",
    });

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(parts);
    const text = result.response.text();

    const outputModeration = await moderateText({
      text,
      scope: "output",
    });

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

    // Persist messages if a conversationId was provided and user is authenticated
    if (conversationId) {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Verify the conversation belongs to this user before inserting
        const { data: conversation } = await supabase
          .from("conversations")
          .select("id")
          .eq("id", conversationId)
          .eq("parent_id", user.id)
          .single();

        if (conversation) {
          await supabase.from("messages").insert([
            {
              conversation_id: conversationId,
              role: "user" as const,
              content: lastMessage.content,
              has_image: Boolean(lastMessage.image),
            },
            {
              conversation_id: conversationId,
              role: "model" as const,
              content: text,
              has_image: false,
            },
          ]);

          // Bump conversation updated_at
          await supabase
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversationId);
        }
      }
    }

    return NextResponse.json({ response: text });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { endpoint: "chat" },
      // LGPD: deliberately omit user data / studentName from context
    });
    return NextResponse.json(
      { error: "Ops! Algo deu errado. Tente novamente em alguns segundos." },
      { status: 500 }
    );
  }
}
