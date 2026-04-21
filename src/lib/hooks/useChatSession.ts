"use client";

import { useCallback, useRef, useState } from "react";
import { type Message, makeWelcomeMessage } from "@/lib/chatUtils";
import { AnalyticsEvent, track } from "@/lib/analytics";

export type MessageWithKey = Message & { _key: string };

export function useChatSession(): {
  messages: MessageWithKey[];
  isLoading: boolean;
  startSession: (name: string) => void;
  sendMessage: (content: string, image: string | null) => Promise<void>;
} {
  const [messages, setMessages] = useState<MessageWithKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const studentNameRef = useRef<string | null>(null);

  const startSession = useCallback((name: string) => {
    studentNameRef.current = name;
    setMessages([
      { ...makeWelcomeMessage(name), _key: crypto.randomUUID() },
    ]);
    track(AnalyticsEvent.CHAT_STARTED, { has_name: true });
  }, []);

  const sendMessage = useCallback(
    async (content: string, image: string | null): Promise<void> => {
      const trimmed = content.trim();
      if (!trimmed && !image) return;
      if (isLoading) return;

      setIsLoading(true);
      const userMessage: MessageWithKey = {
        _key: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        image: image ?? undefined,
      };

      const newMessages: MessageWithKey[] = [...messages, userMessage];
      const messageNumber = newMessages.filter((m) => m.role === "user").length;
      setMessages(newMessages);

      track(AnalyticsEvent.MESSAGE_SENT, {
        has_image: !!image,
        message_number: messageNumber,
      });

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.slice(1).map((m) => {
              const rest: Record<string, unknown> = { ...m };
              delete rest._key;
              return rest;
            }),
            studentName: studentNameRef.current,
          }),
        });

        const contentType = res.headers.get("content-type") ?? "";
        const isStream = contentType.includes("text/event-stream");

        if (isStream && res.body) {
          await consumeSSE(res.body, newMessages, setMessages);
        } else {
          const data = (await res.json()) as Record<string, unknown>;
          let reply: string;
          if (typeof data.error === "string") reply = data.error;
          else if (typeof data.response === "string") reply = data.response;
          else reply = "Ops! Recebi uma resposta inesperada. Tenta de novo!";

          setMessages([
            ...newMessages,
            { _key: crypto.randomUUID(), role: "model", content: reply },
          ]);
        }
      } catch {
        setMessages([
          ...newMessages,
          {
            _key: crypto.randomUUID(),
            role: "model",
            content: "sem conexão. respira, volta quando der.",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading]
  );

  return { messages, isLoading, startSession, sendMessage };
}

async function consumeSSE(
  body: ReadableStream<Uint8Array>,
  baseMessages: MessageWithKey[],
  setter: React.Dispatch<React.SetStateAction<MessageWithKey[]>>
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const assistantKey = crypto.randomUUID();
  let buffer = "";
  let accumulated = "";
  let seeded = false;

  const upsertAssistant = (content: string) => {
    setter((prev) => {
      const hasSeed = prev.some((m) => m._key === assistantKey);
      if (!hasSeed) {
        return [...prev, { _key: assistantKey, role: "model", content }];
      }
      return prev.map((m) =>
        m._key === assistantKey ? { ...m, content } : m
      );
    });
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      let evtName = "message";
      let dataLine = "";
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event:")) evtName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }

      if (!dataLine) continue;
      try {
        const payload = JSON.parse(dataLine) as Record<string, unknown>;
        // Server emits { text } on delta and { message } on blocked/error. Keep
        // these field names in lockstep with src/app/api/chat/route.ts sseEvent
        // calls or streaming renders go silent in production.
        if (evtName === "delta" && typeof payload.text === "string") {
          if (!seeded) {
            seeded = true;
            setter([
              ...baseMessages,
              { _key: assistantKey, role: "model", content: "" },
            ]);
          }
          accumulated += payload.text;
          upsertAssistant(accumulated);
        } else if (
          evtName === "blocked" &&
          typeof payload.message === "string"
        ) {
          accumulated = payload.message;
          upsertAssistant(accumulated);
        } else if (evtName === "error" && typeof payload.message === "string") {
          accumulated = payload.message;
          upsertAssistant(accumulated);
        }
      } catch {
        // Malformed chunk — ignore.
      }
    }
  }
}
