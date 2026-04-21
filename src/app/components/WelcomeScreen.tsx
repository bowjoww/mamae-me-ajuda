"use client";

import { useGoogleSignIn } from "@/lib/hooks/useGoogleSignIn";

interface WelcomeScreenProps {
  nameInput: string;
  onNameChange: (value: string) => void;
  onStart: () => void;
}

export function WelcomeScreen({
  nameInput,
  onNameChange,
  onStart,
}: WelcomeScreenProps) {
  const { signInWithGoogle, isLoading: googleLoading, error: googleError } =
    useGoogleSignIn();

  return (
    <div className="flex flex-col h-dvh max-w-lg mx-auto items-center justify-center px-6 bg-[var(--canvas-base)]">
      <div
        className="w-full max-w-sm text-center p-8 rounded-[18px]"
        style={{
          background: "var(--canvas-surface)",
          border: "1px solid var(--line)",
        }}
      >
        <p
          className="font-hud uppercase mb-3"
          style={{
            color: "var(--ink-secondary)",
            fontSize: "0.625rem",
            letterSpacing: "0.24em",
          }}
        >
          Mamãe, me ajuda!
        </p>
        <h1
          className="font-editorial mb-6"
          style={{
            color: "var(--ink-primary)",
            fontSize: "2.25rem",
            lineHeight: 1.05,
            letterSpacing: "-0.015em",
          }}
        >
          Como você quer ser chamado?
        </h1>

        <label htmlFor="student-name" className="sr-only">
          Qual é o seu nome?
        </label>
        <input
          id="student-name"
          type="text"
          value={nameInput}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onStart()}
          placeholder="Digite seu nome..."
          className="w-full rounded-full px-4 py-3 text-center outline-none transition-all mb-4"
          style={{
            background: "var(--canvas-base)",
            border: "1px solid var(--line)",
            color: "var(--ink-primary)",
            fontSize: "0.9375rem",
          }}
          autoFocus
          autoComplete="given-name"
        />
        <button
          onClick={onStart}
          disabled={!nameInput.trim()}
          className="font-hud uppercase w-full py-3 rounded-full transition-colors mb-4"
          style={{
            background: nameInput.trim()
              ? "var(--violet-action)"
              : "var(--line-soft)",
            color: nameInput.trim()
              ? "var(--ink-primary)"
              : "var(--ink-tertiary)",
            fontSize: "0.75rem",
            letterSpacing: "0.2em",
            opacity: nameInput.trim() ? 1 : 0.6,
            cursor: nameInput.trim() ? "pointer" : "not-allowed",
          }}
        >
          Começar chat
        </button>

        {/* Divider — the Google path unlocks Prova/Estudo/Perfil (needs auth).
            The chat-only path above is a fast entry for pure tutor use. */}
        <div
          className="flex items-center gap-3 my-4"
          aria-hidden="true"
        >
          <div className="flex-1 h-px" style={{ background: "var(--line)" }} />
          <span
            className="font-hud uppercase"
            style={{
              color: "var(--ink-tertiary)",
              fontSize: "0.5625rem",
              letterSpacing: "0.22em",
            }}
          >
            ou
          </span>
          <div className="flex-1 h-px" style={{ background: "var(--line)" }} />
        </div>

        <button
          onClick={() => signInWithGoogle("/")}
          disabled={googleLoading}
          className="w-full py-3 rounded-full transition-colors flex items-center justify-center gap-3"
          style={{
            background: "var(--canvas-base)",
            border: "1px solid var(--line)",
            color: "var(--ink-primary)",
            fontSize: "0.875rem",
            cursor: googleLoading ? "wait" : "pointer",
            opacity: googleLoading ? 0.7 : 1,
          }}
          aria-label="Continuar com Google — desbloqueia Prova, Estudo e Perfil"
        >
          {/* Google "G" mark — inline SVG, no external dep */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width={18}
            height={18}
          >
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span className="font-hud uppercase" style={{ letterSpacing: "0.12em", fontSize: "0.75rem" }}>
            {googleLoading ? "Conectando..." : "Continuar com Google"}
          </span>
        </button>

        {googleError ? (
          <p
            role="alert"
            className="mt-3"
            style={{
              color: "var(--error-wine)",
              fontSize: "0.75rem",
            }}
          >
            Não consegui abrir o Google agora. Tenta de novo?
          </p>
        ) : (
          <p
            className="mt-3"
            style={{
              color: "var(--ink-tertiary)",
              fontSize: "0.6875rem",
              lineHeight: 1.4,
            }}
          >
            Google libera Prova, Estudo e Perfil com progresso salvo.
          </p>
        )}
      </div>
    </div>
  );
}
