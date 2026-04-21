import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ttsRatelimit, getClientIp } from "@/lib/ratelimit";

const ttsSchema = z.object({
  text: z.string().min(1).max(4096),
});

export async function POST(req: NextRequest) {
  try {
    // Rate limiting — runs first so unauthenticated scanners still get throttled.
    if (ttsRatelimit) {
      const ip = getClientIp(req);
      const { success } = await ttsRatelimit.limit(ip);
      if (!success) {
        return NextResponse.json(
          { error: "Muitas requisições de áudio. Aguarde um momento." },
          { status: 429 }
        );
      }
    }

    // Cost-abuse defense is via Upstash rate-limit (20/min per IP) — auth gate
    // removed here so the core chat "ouvir resposta" flow works for anonymous
    // users until Google OAuth signup lands. v1.1 restores requireUser here.
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Chave da API de voz não configurada." },
        { status: 500 }
      );
    }

    // Zod validation
    const body = await req.json();
    const parsed = ttsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Texto inválido na requisição." },
        { status: 400 }
      );
    }

    const { text } = parsed.data;

    // Clean markdown for cleaner speech
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*/g, "")
      .slice(0, 4096);

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: cleanText,
        voice: "nova",
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Erro OpenAI TTS:", error);
      return NextResponse.json(
        { error: "Erro ao gerar áudio." },
        { status: 500 }
      );
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Erro TTS:", error);
    return NextResponse.json(
      { error: "Erro ao gerar áudio." },
      { status: 500 }
    );
  }
}
