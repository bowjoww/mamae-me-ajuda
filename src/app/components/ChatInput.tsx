"use client";

import { useRef } from "react";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  hasImagePreview: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function ChatInput({
  input,
  isLoading,
  hasImagePreview,
  onInputChange,
  onSend,
  onImageSelect,
  inputRef,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const canSend = !isLoading && (input.trim().length > 0 || hasImagePreview);

  return (
    <div
      className="px-3 py-3 shrink-0"
      style={{
        background: "var(--canvas-base)",
        borderTop: "1px solid var(--line-soft)",
      }}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 rounded-full shrink-0 transition-colors"
          style={{
            color: "var(--ink-secondary)",
            border: "1px solid var(--line)",
          }}
          aria-label="Tirar foto ou escolher imagem"
          type="button"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
            />
          </svg>
        </button>

        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            onImageSelect(e);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          aria-hidden="true"
          tabIndex={-1}
        />

        <label htmlFor="chat-input" className="sr-only">
          Digite sua dúvida
        </label>
        <input
          id="chat-input"
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua dúvida..."
          className="flex-1 rounded-full px-4 py-2.5 outline-none transition-all"
          style={{
            background: "var(--canvas-surface)",
            border: "1px solid var(--line-soft)",
            color: "var(--ink-primary)",
            fontSize: "0.875rem",
          }}
          disabled={isLoading}
          aria-label="Mensagem"
          autoComplete="off"
        />

        <button
          onClick={onSend}
          disabled={!canSend}
          className="p-2.5 rounded-full transition-colors disabled:cursor-not-allowed shrink-0"
          style={{
            background: canSend ? "var(--violet-action)" : "var(--line-soft)",
            color: canSend ? "var(--ink-primary)" : "var(--ink-tertiary)",
            opacity: canSend ? 1 : 0.5,
          }}
          aria-label="Enviar mensagem"
          type="button"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
