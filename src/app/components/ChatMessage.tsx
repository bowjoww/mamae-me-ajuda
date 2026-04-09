"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MARKDOWN_BASE_COMPONENTS = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-1 last:mb-0">{children}</p>,
  em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-4 my-1">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-4 my-1">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="my-0">{children}</li>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="bg-black/10 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
  ),
} as const;

interface ChatMessageProps {
  role: "user" | "model";
  content: string;
  image?: string;
  index: number;
  playingIndex: number | null;
  loadingAudio: number | null;
  onSpeak: (text: string, index: number) => void;
}

export function ChatMessage({
  role,
  content,
  image,
  index,
  playingIndex,
  loadingAudio,
  onSpeak,
}: ChatMessageProps) {
  const isUser = role === "user";

  const markdownComponents = useMemo(() => ({
    ...MARKDOWN_BASE_COMPONENTS,
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className={isUser ? "text-white font-bold" : "text-gray-900 font-bold"}>
        {children}
      </strong>
    ),
  }), [isUser]);

  return (
    <div
      className={`message-appear flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm ${
          isUser
            ? "bg-violet-500 text-white rounded-br-md"
            : "bg-white text-gray-800 rounded-bl-md"
        }`}
      >
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt="Foto do exercício enviada pelo aluno"
            className="rounded-lg mb-2 max-h-48 w-auto"
          />
        )}
        <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-0 prose-ul:my-0 prose-ol:my-0">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </div>
        {!isUser && (
          <button
            onClick={() => onSpeak(content, index)}
            disabled={loadingAudio === index}
            className="mt-2 flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-600 transition-colors disabled:opacity-50"
            aria-label={playingIndex === index ? "Parar de ouvir" : "Ouvir resposta em voz alta"}
          >
            {loadingAudio === index ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 animate-spin" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                <span>Carregando...</span>
              </>
            ) : playingIndex === index ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                </svg>
                <span>Parar</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
                <span>Ouvir</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
