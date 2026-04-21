"use client";

import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBar } from "../components/hud/StatusBar";
import { TierBadge } from "../components/hud/TierBadge";
import { LoadErrorState, LoadSkeleton } from "../components/hud/LoadErrorState";
import { TabBar } from "../components/navigation/TabBar";
import {
  createStudyPlanFromUtterance,
  fetchProfile,
  fetchStudyPlan,
} from "@/lib/api/gamificationClient";
import { useAsyncResource } from "@/lib/hooks/useAsyncResource";
import type { Mission, Profile, StudyPlan } from "@/lib/gamification/types";
import { SUBJECT_LABEL } from "@/lib/gamification/types";

interface ProvaResource {
  profile: Profile;
  plan: StudyPlan | null;
}

type PageState = "empty" | "active";

function daysUntil(iso: string): number {
  const now = Date.now();
  const target = new Date(iso).getTime();
  return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
}

const MISSION_ICON: Record<Mission["kind"], ReactNode> = {
  // Abertura — mapa aberto
  abertura: (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6l6-2 4 2 6-2v14l-6 2-4-2-6 2V6Z" />
      <path d="M10 4v14M14 6v14" />
    </svg>
  ),
  // Trilha — pegadas em linha
  trilha: (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12c2-2 4-2 6 0s4 2 6 0 4-2 4 0" />
      <circle cx="5" cy="17" r="1.2" />
      <circle cx="12" cy="17" r="1.2" />
      <circle cx="19" cy="17" r="1.2" />
    </svg>
  ),
  // Oficina — martelo/bigorna simplificada
  oficina: (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h11l3 3v4H7l-3-3V7Z" />
      <path d="M12 14v5M8 19h8" />
    </svg>
  ),
  // Ensaio — ampulheta
  ensaio: (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3h10v2l-5 6 5 6v2H7v-2l5-6-5-6V3Z" />
    </svg>
  ),
  // A Prova — selo/escudo + livro aberto
  prova: (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 4 7v5c0 4.5 3.4 8.4 8 9 4.6-.6 8-4.5 8-9V7l-8-4Z" />
      <path d="M9 11h6M9 14h4" />
    </svg>
  ),
};

function MissionCard({
  mission,
  onStart,
}: {
  mission: Mission;
  onStart?: () => void;
}) {
  const isExam = mission.kind === "prova";
  const borderColor = isExam ? "var(--error-wine)" : "var(--line)";
  const isActive = mission.status === "active";
  const isCompleted = mission.status === "completed";
  const clickable = !!onStart && !isCompleted;

  return (
    <article
      className="surface shrink-0 w-[220px] p-4 flex flex-col gap-3 relative"
      style={{
        borderColor,
        background: isActive
          ? "color-mix(in oklch, var(--violet-action) 6%, var(--canvas-surface))"
          : "var(--canvas-surface)",
        opacity: isCompleted ? 0.65 : 1,
      }}
      aria-label={`${mission.title}: ${mission.subtitle}`}
    >
      {clickable && (
        <button
          type="button"
          onClick={onStart}
          aria-label={`Começar trecho: ${mission.title}`}
          className="absolute inset-0 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-[var(--violet-action)] focus-visible:ring-offset-2 ring-offset-[var(--canvas-base)]"
          style={{ background: "transparent", zIndex: 1 }}
        >
          <span className="sr-only">Começar trecho: {mission.title}</span>
        </button>
      )}
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-full border"
          style={{
            borderColor: isExam ? "var(--error-wine)" : "var(--line)",
            color: isExam ? "var(--error-wine)" : "var(--ink-secondary)",
          }}
        >
          {MISSION_ICON[mission.kind]}
        </span>
        <span
          className="font-hud uppercase"
          style={{
            color: isCompleted
              ? "var(--lime-energy)"
              : isActive
                ? "var(--violet-action)"
                : "var(--ink-tertiary)",
            fontSize: "0.625rem",
            letterSpacing: "0.18em",
          }}
        >
          {isCompleted ? "coletada" : isActive ? "em curso" : "em espera"}
        </span>
      </div>
      <div>
        <h3
          className="font-editorial"
          style={{
            color: "var(--ink-primary)",
            fontSize: "1.25rem",
            lineHeight: 1.2,
          }}
        >
          {mission.title}
        </h3>
        <p
          className="mt-1"
          style={{
            color: "var(--ink-secondary)",
            fontSize: "0.8125rem",
            lineHeight: 1.4,
          }}
        >
          {mission.subtitle}
        </p>
      </div>
      <footer className="flex items-center justify-between border-t border-[var(--line-soft)] pt-2">
        <span
          className="font-hud tabular-nums"
          style={{ color: "var(--ink-primary)", fontSize: "0.75rem" }}
        >
          {mission.progress.done}/{mission.progress.total}
        </span>
        <span
          className="font-hud"
          style={{ color: "var(--ink-tertiary)", fontSize: "0.6875rem" }}
        >
          ~{mission.estimatedMinutes}min
        </span>
      </footer>
    </article>
  );
}

interface EmptyStateProps {
  onCreated: (plan: StudyPlan) => void;
}

function EmptyState({ onCreated }: EmptyStateProps) {
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    subject.trim().length > 0 && date.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    // Build a natural-language utterance the server can parse. Including
    // the AV2 + formato discursivo hint is deliberate — it's Henrique's
    // Colégio Impacto reality and anchors the AI's exam_format extraction.
    const topicFragment = topic.trim() ? `sobre ${topic.trim()}` : "";
    const utterance = [
      `${subject.trim()} no dia ${date}`,
      topicFragment,
      "formato AV2 discursivo 10 questões",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      const { studyPlan } = await createStudyPlanFromUtterance({ utterance });
      onCreated(studyPlan);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Não consegui criar a expedição. Tenta de novo?";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-5 pt-10 pb-28">
      <h1
        className="font-editorial"
        style={{
          color: "var(--ink-primary)",
          fontSize: "var(--text-title)",
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
        }}
      >
        Qual Prova tá te tirando o sono?
      </h1>
      <p
        className="mt-3"
        style={{
          color: "var(--ink-secondary)",
          fontSize: "1rem",
          lineHeight: 1.5,
        }}
      >
        Me conta qual matéria e quando é. A gente mapeia a expedição juntos.
      </p>

      <form className="mt-10 flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2">
          <span
            className="font-hud uppercase"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.6875rem",
              letterSpacing: "0.18em",
            }}
          >
            Matéria
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Matemática, Português, História..."
            className="px-4 py-3 rounded-[10px] border"
            style={{
              background: "var(--canvas-surface)",
              borderColor: "var(--line)",
              color: "var(--ink-primary)",
              fontSize: "0.9375rem",
            }}
            disabled={submitting}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span
            className="font-hud uppercase"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.6875rem",
              letterSpacing: "0.18em",
            }}
          >
            Data da prova
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-4 py-3 rounded-[10px] border"
            style={{
              background: "var(--canvas-surface)",
              borderColor: "var(--line)",
              color: "var(--ink-primary)",
              fontSize: "0.9375rem",
            }}
            disabled={submitting}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span
            className="font-hud uppercase"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.6875rem",
              letterSpacing: "0.18em",
            }}
          >
            Tópico <span style={{ opacity: 0.7 }}>(opcional)</span>
          </span>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ex: plano cartesiano e simetrias"
            className="px-4 py-3 rounded-[10px] border"
            style={{
              background: "var(--canvas-surface)",
              borderColor: "var(--line)",
              color: "var(--ink-primary)",
              fontSize: "0.9375rem",
            }}
            disabled={submitting}
          />
        </label>

        {error && (
          <p
            role="alert"
            className="font-hud"
            style={{
              color: "var(--error-wine)",
              fontSize: "0.8125rem",
              lineHeight: 1.4,
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="font-hud uppercase mt-4 py-4 rounded-full"
          style={{
            background: canSubmit ? "var(--violet-action)" : "var(--line-soft)",
            color: canSubmit ? "var(--ink-primary)" : "var(--ink-tertiary)",
            fontSize: "0.8125rem",
            letterSpacing: "0.2em",
            opacity: canSubmit ? 1 : 0.7,
          }}
          aria-busy={submitting}
        >
          {submitting ? "Mapeando expedição..." : "Começar expedição"}
        </button>
      </form>
    </main>
  );
}

// Persist the active expedição id across reloads. We don't rely on URL
// state yet because the surface is a single-page shell, but this key is
// the contract a future /prova/[id] route can read from.
const ACTIVE_PLAN_STORAGE_KEY = "mma.activePlanId";

function readActivePlanId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_PLAN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeActivePlanId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(ACTIVE_PLAN_STORAGE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_PLAN_STORAGE_KEY);
  } catch {
    // Best-effort.
  }
}

export default function ProvaPage() {
  const router = useRouter();
  // After a successful createStudyPlanFromUtterance we want to surface the
  // plan right away without a reload; this override layers over the hook's
  // data. On cold load we read the stored active plan id and fetch both
  // resources together so we stay consistent with the other pages.
  const [planOverride, setPlanOverride] = useState<StudyPlan | null>(null);

  const loadResource = useCallback(async (): Promise<ProvaResource> => {
    const activePlanId = readActivePlanId();
    const [profile, plan] = await Promise.all([
      fetchProfile(),
      fetchStudyPlan(activePlanId),
    ]);
    return { profile, plan };
  }, []);

  const { data, status, reload } = useAsyncResource<ProvaResource>(loadResource);
  const profile = data?.profile ?? null;
  const plan = planOverride ?? data?.plan ?? null;
  const state: PageState = plan ? "active" : "empty";

  const handleExpeditionCreated = (newPlan: StudyPlan) => {
    writeActivePlanId(newPlan.id);
    setPlanOverride(newPlan);
  };

  const countdown = useMemo(
    () => (plan ? daysUntil(plan.examDateIso) : 0),
    [plan]
  );

  if (status === "loading") {
    return (
      <div className="min-h-dvh bg-[var(--canvas-base)] pb-24">
        <main className="mx-auto max-w-lg px-5 pt-8">
          <LoadSkeleton label="Carregando expedição" />
        </main>
        <TabBar />
      </div>
    );
  }

  if (status === "error" || !profile) {
    return (
      <div className="min-h-dvh bg-[var(--canvas-base)] pb-24">
        <main className="mx-auto max-w-lg px-5 pt-10">
          <LoadErrorState
            eyebrow="Expedição travou"
            message="Expedição não carregou. Tenta de novo?"
            onRetry={reload}
          />
        </main>
        <TabBar />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--canvas-base)] pb-24">
      <StatusBar profile={profile} />

      {state === "empty" || !plan ? (
        <EmptyState onCreated={handleExpeditionCreated} />
      ) : (
        <main className="mx-auto max-w-lg px-5 pt-6 pb-16">
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p
                className="font-hud uppercase"
                style={{
                  color: "var(--ink-secondary)",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.2em",
                }}
              >
                Expedição · {SUBJECT_LABEL[plan.subject]}
              </p>
              <h1
                className="font-editorial mt-2"
                style={{
                  color: "var(--ink-primary)",
                  fontSize: "var(--text-title)",
                  lineHeight: 1.05,
                  letterSpacing: "-0.02em",
                }}
              >
                {plan.title}
              </h1>
              <p
                className="font-hud tabular-nums mt-3"
                style={{
                  color: "var(--warn)",
                  fontSize: "0.8125rem",
                  letterSpacing: "0.1em",
                }}
                aria-label={`Faltam ${countdown} dias`}
              >
                T−{countdown} dias
              </p>
            </div>
            <TierBadge tier={plan.tier} size="large" label={false} />
          </header>

          <section aria-labelledby="timeline-heading" className="mt-10">
            <h2
              id="timeline-heading"
              className="font-hud uppercase mb-4"
              style={{
                color: "var(--ink-secondary)",
                fontSize: "0.6875rem",
                letterSpacing: "0.2em",
              }}
            >
              Rota da expedição
            </h2>
            <div
              className="flex gap-3 overflow-x-auto pb-4 -mx-5 px-5"
              style={{ scrollbarWidth: "thin" }}
              role="list"
            >
              {plan.missions.map((m) => (
                <div key={m.id} role="listitem">
                  <MissionCard
                    mission={m}
                    onStart={() => router.push("/estudo")}
                  />
                </div>
              ))}
            </div>
          </section>

        </main>
      )}

      <TabBar />
    </div>
  );
}
