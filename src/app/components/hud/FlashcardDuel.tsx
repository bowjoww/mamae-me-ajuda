"use client";

import { useState } from "react";
import type { Flashcard, FlashcardGrade } from "@/lib/gamification/types";
import { SUBJECT_LABEL } from "@/lib/gamification/types";

interface FlashcardDuelProps {
  card: Flashcard;
  onGrade: (grade: FlashcardGrade) => void;
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

  const handleGrade = (grade: FlashcardGrade) => {
    onGrade(grade);
    setRevealed(false);
  };

  return (
    <section
      aria-label="Duelo de flashcards"
      className="flex flex-col gap-6 w-full"
    >
      <div
        className="surface-elevated p-7 min-h-[260px] flex flex-col"
        role="region"
        aria-live="polite"
      >
        <span
          className="font-hud uppercase"
          style={{
            color: "var(--ink-secondary)",
            fontSize: "0.6875rem",
            letterSpacing: "0.16em",
          }}
        >
          {SUBJECT_LABEL[card.subject]} · {card.topic}
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
          {card.front}
        </p>

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
            {card.back}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            // Disclosure semantics: WAI-ARIA Authoring Practices recommend
            // aria-expanded + aria-controls for "reveal inline content"
            // patterns (NOT aria-haspopup — that's for menus/listboxes).
            // aria-controls points to the container rendered above when
            // `revealed` flips to true.
            aria-expanded={revealed}
            aria-controls="flashcard-answer"
            className="font-hud uppercase self-start mt-5 px-4 py-2 rounded-full border border-[var(--line)]"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.6875rem",
              letterSpacing: "0.16em",
            }}
          >
            Revelar resposta
          </button>
        )}
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
