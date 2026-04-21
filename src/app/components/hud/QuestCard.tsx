"use client";

import type { Quest } from "@/lib/gamification/types";
import { SUBJECT_LABEL } from "@/lib/gamification/types";

interface QuestCardProps {
  quest: Quest;
  onStart?: (quest: Quest) => void;
  featured?: boolean;
}

/**
 * Status copy tuned to the exploration frame:
 *   idle      — esta etapa ainda está "em espera"
 *   active    — esta etapa está "em curso"
 *   completed — "coletada"
 *   expired   — "encerrada"
 *   defeated  — "perdida"
 */
const STATUS_COPY: Record<Quest["status"], { label: string; tone: string }> = {
  idle: { label: "em espera", tone: "var(--ink-secondary)" },
  active: { label: "em curso", tone: "var(--lime-energy)" },
  completed: { label: "coletada", tone: "var(--lime-energy)" },
  expired: { label: "encerrada", tone: "var(--warn)" },
  defeated: { label: "perdida", tone: "var(--error-wine)" },
};

export function QuestCard({ quest, onStart, featured = false }: QuestCardProps) {
  const isActive = quest.status === "active";
  const isCompleted = quest.status === "completed";
  const isIdle = quest.status === "idle";
  const status = STATUS_COPY[quest.status];

  const titleSize = featured ? "1.75rem" : "1.375rem";
  const padding = featured ? "p-6" : "p-5";

  // Idle etapas get a dashed border — "trilha futura". Active/completed use
  // a solid, confident line. Completed dims to signal it's behind the user.
  const borderStyle: "solid" | "dashed" = isIdle ? "dashed" : "solid";
  const borderColor = isActive
    ? "color-mix(in oklch, var(--violet-action) 55%, var(--line))"
    : isCompleted
      ? "color-mix(in oklch, var(--lime-energy) 35%, var(--line))"
      : "var(--line)";

  // WCAG 2.2 SC 4.1.2 Name, Role, Value. Previously the <article> carried an
  // aria-label and the overlay <button> carried a separate aria-label with
  // the same title, so TalkBack would read the title twice (once from the
  // article landmark, once from the button). The article now relies on its
  // visible heading for labelling, and the overlay button owns the single
  // accessible name for the interaction.
  return (
    <article
      className={`group relative block w-full text-left transition-transform duration-[240ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 ${padding} ${
        isActive ? "quest-active-pulse" : ""
      }`}
      style={{
        aspectRatio: featured ? undefined : "4 / 3",
        background: "var(--canvas-surface)",
        border: `1px ${borderStyle} ${borderColor}`,
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        opacity: isCompleted ? 0.72 : 1,
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <span
          className="item-label font-hud uppercase"
          style={{
            color: "var(--ink-secondary)",
            fontSize: "0.625rem",
            letterSpacing: "0.16em",
          }}
        >
          {SUBJECT_LABEL[quest.subject]}
        </span>
        <span
          className="font-hud uppercase shrink-0"
          style={{
            color: status.tone,
            fontSize: "0.625rem",
            letterSpacing: "0.18em",
          }}
          aria-label={`Status: ${status.label}`}
        >
          {status.label}
        </span>
      </header>

      <div className="flex-1 my-3">
        <h3
          className="font-editorial"
          style={{
            color: "var(--ink-primary)",
            fontSize: titleSize,
            lineHeight: 1.1,
            letterSpacing: "-0.01em",
          }}
        >
          {quest.title}
        </h3>
        <p
          className="mt-2"
          style={{
            color: "var(--ink-secondary)",
            fontSize: "0.875rem",
            lineHeight: 1.5,
          }}
        >
          {quest.description}
        </p>
      </div>

      <footer className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--line-soft)]">
        <div className="flex items-baseline gap-3">
          <span
            className="font-hud tabular-nums"
            style={{
              color: "var(--ink-primary)",
              fontSize: "0.875rem",
            }}
            aria-label={`${quest.objectivesDone} de ${quest.objectivesTotal} coletadas`}
          >
            {quest.objectivesDone}/{quest.objectivesTotal}
          </span>
          <span
            className="font-hud uppercase"
            style={{
              color: "var(--ink-tertiary)",
              fontSize: "0.625rem",
              letterSpacing: "0.14em",
            }}
          >
            coletadas
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span
            className="font-hud"
            style={{ color: "var(--violet-action)", fontSize: "0.8125rem" }}
          >
            +{quest.xpReward} XP
          </span>
          <span
            className="font-hud"
            style={{ color: "var(--ink-tertiary)", fontSize: "0.75rem" }}
          >
            ~{quest.estimatedMinutes}min
          </span>
        </div>
      </footer>

      {onStart && !isCompleted && (
        <button
          type="button"
          onClick={() => onStart(quest)}
          className="absolute inset-0 rounded-[14px] ring-offset-[var(--canvas-base)] focus-visible:ring-2 focus-visible:ring-[var(--violet-action)] focus-visible:ring-offset-2"
          aria-label={`Começar etapa: ${quest.title}`}
          style={{ background: "transparent" }}
        >
          <span className="sr-only">Começar etapa: {quest.title}</span>
        </button>
      )}
    </article>
  );
}
