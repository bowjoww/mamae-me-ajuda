"use client";

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
          className="font-hud uppercase w-full py-3 rounded-full transition-colors"
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
          Começar
        </button>
      </div>
    </div>
  );
}
