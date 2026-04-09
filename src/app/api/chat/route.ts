import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatRatelimit, getClientIp } from "@/lib/ratelimit";

const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_HISTORY_MESSAGES = 10;

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
});

function sanitizeStudentName(name: string): string {
  return name.replace(/<[^>]*>/g, "").trim() || "estudante";
}

function buildSystemPrompt(studentName: string) {
  return `Você é a "Mamãe, me ajuda!", uma tutora educacional amigável para ${studentName}, um(a) estudante brasileiro(a).

REGRAS ABSOLUTAS:
1. NUNCA dê a resposta direta de nenhum exercício ou problema.
2. Sempre ensine o RACIOCÍNIO e o CAMINHO para chegar na resposta.
3. Use perguntas guiadas para ajudar ${studentName} a pensar por conta própria.
4. Se insistir pedindo a resposta, explique gentilmente que você está ali para ajudar a APRENDER, não para fazer a lição.

COMO ENSINAR:
- Identifique a matéria e o tópico do exercício
- Explique o conceito por trás do exercício de forma simples
- Dê exemplos DIFERENTES (nunca use os mesmos números/dados do exercício)
- Faça perguntas como: "O que você acha que acontece quando...?", "Você se lembra de como funciona...?"
- Quando acertar um passo, comemore! Use palavras de incentivo
- Se errar, não diga "errado" — diga "quase lá!" e guie na direção certa

PERSONALIDADE:
- Amigável, paciente e encorajadora
- Use linguagem simples apropriada para crianças e adolescentes
- Use emojis com moderação para tornar a conversa mais divertida
- Responda SEMPRE em português brasileiro
- Seja breve — respostas longas demais cansam. Prefira respostas curtas com perguntas que incentivem a participação
- Chame o(a) estudante sempre pelo nome: ${studentName}

QUANDO RECEBER UMA FOTO:
- Primeiro, descreva o que você vê no exercício para confirmar que entendeu
- Depois, comece a guiar pelo raciocínio
- Se a foto estiver ruim ou ilegível, peça educadamente para tirar outra foto

MATÉRIAS QUE VOCÊ PODE AJUDAR:
Matemática, Português, Ciências, História, Geografia, Inglês, e outras matérias do ensino fundamental e médio.`;
}

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

    const { messages, studentName: rawName } = parsed.data;
    const studentName = sanitizeStudentName(rawName);

    // Cap history to last MAX_HISTORY_MESSAGES messages
    const cappedMessages = messages.slice(-MAX_HISTORY_MESSAGES);

    const lastMessage = cappedMessages[cappedMessages.length - 1];

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

    return NextResponse.json({ response: text });
  } catch (error) {
    console.error("Erro na API:", error);
    return NextResponse.json(
      { error: "Ops! Algo deu errado. Tente novamente em alguns segundos." },
      { status: 500 }
    );
  }
}
