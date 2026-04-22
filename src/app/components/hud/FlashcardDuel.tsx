"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Flashcard, FlashcardGrade } from "@/lib/gamification/types";
import { SUBJECT_LABEL } from "@/lib/gamification/types";

const ONBOARD_STORAGE_KEY = "mma.flashcardOnboarded";
const CHAT_SEED_STORAGE_KEY = "mma.pendingChatSeed";

interface FlashcardDuelProps {
  card: Flashcard;
  onGrade: (grade: FlashcardGrade, hintsUsed: number) => void;
}

const GRADE_BUTTONS: Array<{
  grade: FlashcardGrade;
  label: string;
  color: string;
  ariaLabel: string;
}> = [
  {
    grade: "errei",
    label: "errei",
    color: "var(--error-wine)",
    ariaLabel: "Errei esta questão",
  },
  {
    grade: "quase",
    label: "quase",
    color: "var(--warn)",
    ariaLabel: "Quase acertei",
  },
  {
    grade: "acertei",
    label: "acertei",
    color: "var(--lime-energy)",
    ariaLabel: "Acertei",
  },
];

export function FlashcardDuel({ card, onGrade }: FlashcardDuelProps) {
  const [revealed, setRevealed] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const [showOnboard, setShowOnboard] = useState(false);
  const router = useRouter();
  // Defensive field access — the backend evolved separately (raw DB rows
  // reaching the client before mappers were added) and any missing field
  // used to crash the whole /estudo page with "Cannot read properties of
  // undefined". Coerce everything to safe defaults at the top so the
  // render tree stays valid even against partial payloads.
  const cardSubject = card?.subject;
  const cardTopic = card?.topic ?? "";
  const cardFront = card?.front ?? "";
  const cardBack = card?.back ?? "";
  const subjectLabel = cardSubject ? SUBJECT_LABEL[cardSubject] : "Estudo";
  const hintChain = card?.hintChain ?? [];
  const hasMoreHints = hintsShown < hintChain.length;

  // First-use onboarding: the Board caught that users didn't know the
  // ler→pensar→revelar→avaliar flow. We show a one-time banner that the
  // user can dismiss; localStorage persists the dismissal so repeat
  // sessions aren't noisy.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(ONBOARD_STORAGE_KEY);
      if (!seen) setShowOnboard(true);
    } catch {
      // localStorage disabled — just show the banner, persistent dismiss
      // won't work but the UX still degrades gracefully.
      setShowOnboard(true);
    }
  }, []);

  const dismissOnboard = () => {
    setShowOnboard(false);
    try {
      window.localStorage.setItem(ONBOARD_STORAGE_KEY, "1");
    } catch {
      // Best-effort only.
    }
  };

  const handleGrade = (grade: FlashcardGrade) => {
    // hintsShown is what the SRS/XP engine needs — the XP table pays
    // more for self-solves (hintsUsed=0 → 15 XP) than hint-assisted
    // ones (1 → 10, 2+ → 6). Pass the count upstream so the backend
    // can credit correctly. Reset state for the next card.
    onGrade(grade, hintsShown);
    setRevealed(false);
    setHintsShown(0);
  };

  // Escape hatch for "não entendi nada que a resposta trouxe". Seeds the
  // chat input with a contextual question so the student doesn't have to
  // re-type the card text, then navigates to /. The chat page reads the
  // seed from sessionStorage on mount.
  const handleAskForHelp = () => {
    const seed = revealed
      ? `Não entendi muito bem esta resposta. Pode explicar de outro jeito?\n\nPergunta: ${cardFront}\n\nResposta: ${cardBack}`
      : `Preciso de uma dica para esta pergunta, sem me dar a resposta:\n\n${cardFront}`;
    try {
      window.sessionStorage.setItem(CHAT_SEED_STORAGE_KEY, seed);
    } catch {
      // sessionStorage disabled — fall back to a URL param so the flow
      // still works, just less elegant.
      const query = encodeURIComponent(seed);
      router.push(`/?ask=${query}`);
      return;
    }
    router.push("/");
  };

  return (
    <section
      aria-label="Duelo de flashcards"
      className="flex flex-col gap-6 w-full"
    >
      {showOnboard && (
        <aside
          className="surface p-4 flex flex-col gap-3"
          style={{
            borderColor: "color-mix(in oklch, var(--violet-action) 40%, var(--line))",
            background:
              "color-mix(in oklch, var(--violet-action) 6%, var(--canvas-surface))",
          }}
          aria-label="Como estudar com flashcards"
        >
          <p
            className="font-hud uppercase"
            style={{
              color: "var(--violet-action)",
              fontSize: "0.625rem",
              letterSpacing: "0.18em",
            }}
          >
            Como funciona
          </p>
          <ol
            style={{
              color: "var(--ink-primary)",
              fontSize: "0.875rem",
              lineHeight: 1.55,
              paddingLeft: 16,
              listStyle: "decimal",
            }}
          >
            <li>Lê a pergunta e pensa — pode escrever no caderno.</li>
            <li>Tá travado? Toca em <strong>pedir ajuda</strong> pra falar com a tutora.</li>
            <li>Quando estiver pronto, toca em <strong>revelar resposta</strong>.</li>
            <li>Escolhe <strong>errei / quase / acertei</strong> — seja sincero, é só pra mim saber o que revisar contigo.</li>
          </ol>
          <button
            type="button"
            onClick={dismissOnboard}
            className="font-hud uppercase self-start px-3 py-1.5 rounded-full border border-[var(--violet-action)]"
            style={{
              color: "var(--violet-action)",
              fontSize: "0.6875rem",
              letterSpacing: "0.16em",
            }}
          >
            Entendi
          </button>
        </aside>
      )}
      <div
        className="surface-elevated p-7 min-h-[260px] flex flex-col"
        role="region"
        aria-live="polite"
      >
        <span
          className="font-hud uppercase block truncate"
          style={{
            color: "var(--ink-secondary)",
            fontSize: "0.6875rem",
            letterSpacing: "0.16em",
            maxWidth: "100%",
          }}
          title={`${subjectLabel}${cardTopic ? " · " + cardTopic : ""}`}
        >
          {/* Truncate long auto-generated topic titles (older plans have
              40+ char topic names like "Mini-simulado AV2 discursivo com
              10 questões e correção comentada" that were shouting at the
              student). Cap to ~36 chars plus ellipsis so the header stays
              a single line. The full text is preserved in the title tooltip. */}
          {subjectLabel}
          {cardTopic
            ? " · " +
              (cardTopic.length > 40
                ? cardTopic.slice(0, 36).trimEnd() + "…"
                : cardTopic)
            : ""}
        </span>
        <p
          className="font-editorial flex-1 mt-5"
          style={{
            color: "var(--ink-primary)",
            fontSize: "1.5rem",
            lineHeight: 1.28,
            letterSpacing: "-0.01em",
          }}
        >
          {cardFront}
        </p>

        {hintsShown > 0 && !revealed && (
          <div
            className="mt-5 pt-5 border-t border-[var(--line-soft)] flex flex-col gap-3"
            aria-live="polite"
          >
            <p
              className="font-hud uppercase"
              style={{
                color: "var(--violet-action)",
                fontSize: "0.625rem",
                letterSpacing: "0.18em",
              }}
            >
              Dicas socráticas ({hintsShown}/{hintChain.length})
            </p>
            {hintChain.slice(0, hintsShown).map((hint, idx) => (
              <p
                key={idx}
                className="message-appear"
                style={{
                  color: "var(--ink-primary)",
                  fontSize: "0.9375rem",
                  lineHeight: 1.55,
                  paddingLeft: 14,
                  borderLeft: "2px solid color-mix(in oklch, var(--violet-action) 60%, transparent)",
                }}
              >
                {hint}
              </p>
            ))}
          </div>
        )}
        {revealed ? (
          <div
            id="flashcard-answer"
            className="mt-5 pt-5 border-t border-[var(--line-soft)] message-appear"
            style={{
              color: "var(--ink-primary)",
              fontSize: "0.9375rem",
              lineHeight: 1.5,
            }}
          >
            <p
              className="font-hud uppercase mb-2"
              style={{
                color: "var(--lime-energy)",
                fontSize: "0.625rem",
                letterSpacing: "0.18em",
              }}
            >
              Resposta comentada
            </p>
            {cardBack}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {!revealed && hasMoreHints && (
            <button
              type="button"
              onClick={() => setHintsShown((n) => Math.min(n + 1, hintChain.length))}
              className="font-hud uppercase px-4 py-2 rounded-full border"
              style={{
                color: "var(--violet-action)",
                borderColor: "color-mix(in oklch, var(--violet-action) 60%, var(--line))",
                background: "color-mix(in oklch, var(--violet-action) 4%, transparent)",
                fontSize: "0.6875rem",
                letterSpacing: "0.16em",
              }}
              aria-label={hintsShown === 0 ? "Mostrar primeira dica socrática" : "Mostrar próxima dica socrática"}
            >
              {hintsShown === 0 ? "Pedir dica" : "Outra dica"}
            </button>
          )}
          {!revealed && (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              aria-expanded={revealed}
              aria-controls="flashcard-answer"
              className="font-hud uppercase px-4 py-2 rounded-full border border-[var(--line)]"
              style={{
                color: "var(--ink-secondary)",
                fontSize: "0.6875rem",
                letterSpacing: "0.16em",
              }}
            >
              Revelar resposta
            </button>
          )}
          <button
            type="button"
            onClick={handleAskForHelp}
            className="font-hud uppercase px-4 py-2 rounded-full border border-[var(--violet-action)]"
            style={{
              color: "var(--violet-action)",
              fontSize: "0.6875rem",
              letterSpacing: "0.16em",
            }}
            aria-label={
              revealed
                ? "Pedir à tutora que explique a resposta de outro jeito"
                : "Falar com a tutora no chat sem ver a resposta"
            }
          >
            {revealed ? "Explicar no chat" : "Chat da tutora"}
          </button>
        </div>
      </div>

      <div
        className="grid grid-cols-3 gap-2"
        role="group"
        aria-label="Avalie sua resposta"
        aria-describedby="flashcard-grade-hint"
      >
        {GRADE_BUTTONS.map((btn) => (
          <button
            key={btn.grade}
            type="button"
            onClick={() => handleGrade(btn.grade)}
            // `disabled` already prevents the click; we add `aria-disabled`
            // explicitly so screen readers announce the state and
            // `aria-describedby` pairs each button with the hint that
            // explains *why* it's disabled (reveal the answer first).
            disabled={!revealed}
            aria-disabled={!revealed}
            aria-describedby="flashcard-grade-hint"
            aria-label={btn.ariaLabel}
            className="font-hud uppercase py-4 rounded-[12px] border transition-all"
            style={{
              borderColor: revealed ? btn.color : "var(--line-soft)",
              color: revealed ? btn.color : "var(--ink-tertiary)",
              background: revealed
                ? `color-mix(in oklch, ${btn.color} 8%, transparent)`
                : "transparent",
              fontSize: "0.75rem",
              letterSpacing: "0.18em",
              cursor: revealed ? "pointer" : "not-allowed",
              opacity: revealed ? 1 : 0.45,
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
      {/*
        Visually-hidden hint tied to the button group via aria-describedby.
        Rendered in DOM for screen readers (AT ignores display:none; we use
        sr-only class pattern). When `revealed`, the hint switches to an
        invitation so the message never goes stale.
      */}
      <p id="flashcard-grade-hint" className="sr-only">
        {revealed
          ? "Escolha como você se saiu: errei, quase ou acertei."
          : "Revele a resposta primeiro para avaliar seu desempenho."}
      </p>
    </section>
  );
}
