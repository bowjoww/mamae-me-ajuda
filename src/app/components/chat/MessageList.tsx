"use client";

import { useEffect, useRef } from "react";
import { ChatMessage } from "../ChatMessage";
import { TypingIndicator } from "../TypingIndicator";
import type { MessageWithKey } from "@/lib/hooks/useChatSession";

/** Scroll debounce interval in ms — avoids layout thrash on every SSE token */
const SCROLL_DEBOUNCE_MS = 100;

interface MessageListProps {
  messages: MessageWithKey[];
  isLoading: boolean;
  playingIndex: number | null;
  loadingAudio: number | null;
  onSpeak: (text: string, index: number) => void;
}

/**
 * Renders the chat transcript. Accessibility notes:
 *
 *  - Uses `<section role="log">` instead of `<main>` so that pages embedding
 *    this component can own the `<main>` landmark (one `<main>` per document,
 *    WCAG 2.2 SC 1.3.1). `role="log"` is the conventional role for chat
 *    transcripts.
 *  - `aria-live` is scoped to a small "new message" region at the end of the
 *    list rather than the whole transcript. Previously, assistive tech would
 *    re-announce old messages whenever a re-render happened.
 */
export function MessageList({
  messages,
  isLoading,
  playingIndex,
  loadingAudio,
  onSpeak,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Debounce scroll-to-bottom so rapid SSE token updates do not fire
    // scrollIntoView on every render (each call triggers layout, hurting INP).
    if (scrollTimerRef.current !== null) {
      clearTimeout(scrollTimerRef.current);
    }
    scrollTimerRef.current = setTimeout(() => {
      const el = endRef.current;
      if (!el) return;
      // scrollTop on the parent is cheaper than scrollIntoView (no layout query)
      const parent = el.parentElement;
      if (parent) {
        parent.scrollTop = parent.scrollHeight;
      }
      scrollTimerRef.current = null;
    }, SCROLL_DEBOUNCE_MS);

    return () => {
      if (scrollTimerRef.current !== null) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
    };
  }, [messages, isLoading]);

  // `Message["role"]` is "user" | "model" — the tutor's messages are "model".
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((msg) => msg.role === "model");

  return (
    <section
      className="flex-1 overflow-y-auto chat-scroll px-4 py-4 space-y-3"
      aria-label="Conversa com a tutora"
      role="log"
    >
      {messages.map((msg, i) => (
        <ChatMessage
          key={msg._key}
          role={msg.role}
          content={msg.content}
          image={msg.image}
          index={i}
          playingIndex={playingIndex}
          loadingAudio={loadingAudio}
          onSpeak={onSpeak}
        />
      ))}

      {isLoading && <TypingIndicator />}

      {/* Narrow live region: only the latest assistant response is announced,
          avoiding re-announcement of the full transcript on every render. */}
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {!isLoading && latestAssistantMessage ? latestAssistantMessage.content : ""}
      </div>

      <div ref={endRef} aria-hidden="true" />
    </section>
  );
}
