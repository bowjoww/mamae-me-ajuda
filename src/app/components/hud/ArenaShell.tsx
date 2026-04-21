"use client";

import type { ReactNode } from "react";

interface ArenaShellProps {
  children: ReactNode;
  title?: string;
  onExit?: () => void;
}

/**
 * Wrapper for active sessions — flashcard rounds, ensaios, focused study.
 * Darker canvas, tighter chrome, the label reads "Travessia" to match the
 * exploration/crafting vocabulary used throughout the app.
 *
 * Component name kept as ArenaShell for import stability; the visible
 * string is the only thing players ever see and it's now "travessia".
 */
export function ArenaShell({ children, title, onExit }: ArenaShellProps) {
  return (
    <div className="arena-shell min-h-dvh flex flex-col">
      <header
        className="sticky top-0 z-30 border-b border-[var(--line-soft)] px-4 py-3 flex items-center justify-between bg-[var(--arena-base)]"
        aria-label="Sessão ativa"
      >
        <span
          className="font-hud uppercase"
          style={{
            color: "var(--lime-energy)",
            fontSize: "0.6875rem",
            letterSpacing: "0.22em",
          }}
        >
          travessia · {title ?? "em curso"}
        </span>
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="font-hud uppercase px-3 py-1.5 rounded-full border border-[var(--line)]"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.625rem",
              letterSpacing: "0.18em",
            }}
            aria-label="Sair da sessão"
          >
            Sair
          </button>
        )}
      </header>
      <div className="flex-1 mx-auto w-full max-w-lg px-4 py-6">
        {children}
      </div>
    </div>
  );
}
