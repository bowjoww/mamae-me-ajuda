"use client";

import { useCallback, useMemo, useState } from "react";
import { StatusBar } from "../components/hud/StatusBar";
import { QuestCard } from "../components/hud/QuestCard";
import { ArenaShell } from "../components/hud/ArenaShell";
import { FlashcardDuel } from "../components/hud/FlashcardDuel";
import { LoadErrorState, LoadSkeleton } from "../components/hud/LoadErrorState";
import { TabBar } from "../components/navigation/TabBar";
import {
  fetchNextFlashcards,
  fetchProfile,
  fetchQuests,
  fetchTopics,
  submitFlashcardReview,
} from "@/lib/api/gamificationClient";
import { useAsyncResource } from "@/lib/hooks/useAsyncResource";
import type {
  Flashcard,
  FlashcardGrade,
  Profile,
  Quest,
  TopicRow,
} from "@/lib/gamification/types";
import { SUBJECT_LABEL } from "@/lib/gamification/types";

interface EstudoHubData {
  profile: Profile;
  quests: Quest[];
  topics: TopicRow[];
}

type PageState = "hub" | "collect" | "recap";

interface CollectSummary {
  xp: number;
  hits: number;
  almost: number;
  misses: number;
  total: number;
}

const MASTERY_LABEL: Record<TopicRow["mastery"], string> = {
  new: "novo",
  progress: "em progresso",
  mastered: "dominado",
};

function MasteryDot({ mastery }: { mastery: TopicRow["mastery"] }) {
  const base = {
    width: 10,
    height: 10,
    borderRadius: 99,
    border: "1.5px solid var(--lime-energy)",
  };

  if (mastery === "new") {
    return (
      <span
        style={{ ...base, background: "transparent" }}
        aria-label={MASTERY_LABEL.new}
      />
    );
  }

  if (mastery === "progress") {
    return (
      <span
        style={{
          ...base,
          background:
            "linear-gradient(90deg, var(--lime-energy) 50%, transparent 50%)",
        }}
        aria-label={MASTERY_LABEL.progress}
      />
    );
  }

  return (
    <span
      style={{ ...base, background: "var(--lime-energy)" }}
      aria-label={MASTERY_LABEL.mastered}
    />
  );
}

export default function EstudoPage() {
  const [state, setState] = useState<PageState>("hub");
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CollectSummary>({
    xp: 0,
    hits: 0,
    almost: 0,
    misses: 0,
    total: 0,
  });

  // Single async resource wraps profile+quests+topics. If any of them
  // throws (backend down, migration missing), the whole hub enters the
  // error state together rather than rendering a half-lit screen.
  const loadHub = useCallback(async (): Promise<EstudoHubData> => {
    const [profile, quests, topics] = await Promise.all([
      fetchProfile(),
      fetchQuests(),
      fetchTopics(),
    ]);
    return { profile, quests, topics };
  }, []);

  const { data, status, reload } = useAsyncResource<EstudoHubData>(loadHub);
  const profile = data?.profile ?? null;
  const quests = data?.quests ?? [];
  const topics = data?.topics ?? [];

  const featured = useMemo(
    () => quests.find((q) => q.featured) ?? quests[0] ?? null,
    [quests]
  );
  const otherQuests = useMemo(
    () => quests.filter((q) => q.id !== featured?.id),
    [quests, featured]
  );

  const startCollect = async () => {
    // First-time bootstrap hits GPT-5.1 to generate 5 cards and can take
    // 5-15s; surface a loading state so the user doesn't tap repeatedly
    // thinking the button is dead.
    setCollectLoading(true);
    setCollectError(null);
    try {
      const next = await fetchNextFlashcards(5);
      if (next.length === 0) {
        setCollectError(
          "Sem cartas prontas ainda. Abre uma expedição em Prova pra gente mapear."
        );
        setCollectLoading(false);
        return;
      }
      setCards(next);
      setCardIdx(0);
      setSummary({
        xp: 0,
        hits: 0,
        almost: 0,
        misses: 0,
        total: next.length,
      });
      setState("collect");
    } catch (err) {
      setCollectError(
        err instanceof Error
          ? err.message
          : "Não consegui preparar a coleta. Tenta de novo?"
      );
    } finally {
      setCollectLoading(false);
    }
  };

  const exitCollect = () => {
    setState("hub");
  };

  const onGrade = async (grade: FlashcardGrade) => {
    const current = cards[cardIdx];
    if (!current) return;
    const outcome = await submitFlashcardReview(current.id, grade);
    setSummary((prev) => ({
      xp: prev.xp + outcome.xpAwarded,
      hits: prev.hits + (grade === "acertei" ? 1 : 0),
      almost: prev.almost + (grade === "quase" ? 1 : 0),
      misses: prev.misses + (grade === "errei" ? 1 : 0),
      total: prev.total,
    }));
    if (cardIdx + 1 >= cards.length) {
      setState("recap");
    } else {
      setCardIdx(cardIdx + 1);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-dvh bg-[var(--canvas-base)] pb-24">
        <main className="mx-auto max-w-lg px-5 pt-8">
          <LoadSkeleton label="Carregando coleta" />
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
            eyebrow="Mapa rasgado"
            message="Sem mapa da coleta agora. Retorna?"
            onRetry={reload}
          />
        </main>
        <TabBar />
      </div>
    );
  }

  if (state === "collect" && cards.length > 0) {
    const current = cards[cardIdx];
    return (
      <ArenaShell
        title={`coleta · ${cardIdx + 1}/${cards.length}`}
        onExit={exitCollect}
      >
        <FlashcardDuel card={current} onGrade={onGrade} />
      </ArenaShell>
    );
  }

  if (state === "recap") {
    return (
      <ArenaShell title="recapitulação" onExit={exitCollect}>
        <div className="flex flex-col gap-8">
          <div>
            <p
              className="font-hud uppercase"
              style={{
                color: "var(--lime-energy)",
                fontSize: "0.6875rem",
                letterSpacing: "0.2em",
              }}
            >
              Coleta concluída
            </p>
            <h1
              className="font-editorial mt-3"
              style={{
                color: "var(--ink-primary)",
                fontSize: "2rem",
                lineHeight: 1.1,
              }}
            >
              {summary.hits} acertos de {summary.total}.
            </h1>
          </div>
          <dl className="grid grid-cols-3 gap-3">
            <StatCell label="XP" value={`+${summary.xp}`} tone="violet" />
            <StatCell label="quase" value={summary.almost} tone="warn" />
            <StatCell label="erros" value={summary.misses} tone="error" />
          </dl>
          <p
            style={{ color: "var(--ink-secondary)", fontSize: "0.875rem" }}
          >
            Próxima revisão marcada automaticamente. Seu ritmo está firme.
            Próxima checagem em 2 sessões.
          </p>
          <button
            type="button"
            onClick={exitCollect}
            className="font-hud uppercase self-start px-5 py-2.5 rounded-full border border-[var(--violet-action)]"
            style={{
              color: "var(--violet-action)",
              fontSize: "0.75rem",
              letterSpacing: "0.18em",
            }}
          >
            Voltar ao acampamento
          </button>
        </div>
      </ArenaShell>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--canvas-base)] pb-24">
      <StatusBar profile={profile} />

      <main className="mx-auto max-w-lg px-5 pt-6">
        <header className="mb-6">
          <p
            className="font-hud uppercase"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.6875rem",
              letterSpacing: "0.2em",
            }}
          >
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "short",
            })}
          </p>
          <h1
            className="font-editorial mt-2"
            style={{
              color: "var(--ink-primary)",
              fontSize: "var(--text-title)",
              lineHeight: 1.08,
            }}
          >
            Coleta de hoje
          </h1>
        </header>

        {quests.length === 0 ? (
          // Empty state (dia zero) — no quests means the user hasn't
          // mapped a prova yet. Point them at /prova rather than leaving
          // the hub silent.
          <div
            className="surface p-5 flex flex-col gap-3"
            style={{ borderColor: "var(--line-soft)" }}
          >
            <p
              style={{
                color: "var(--ink-secondary)",
                fontSize: "0.9375rem",
                lineHeight: 1.5,
              }}
            >
              Nada na mochila pra hoje. Abre uma expedição em Prova.
            </p>
            <a
              href="/prova"
              className="font-hud uppercase self-start px-4 py-2 rounded-full border border-[var(--violet-action)]"
              style={{
                color: "var(--violet-action)",
                fontSize: "0.6875rem",
                letterSpacing: "0.18em",
              }}
            >
              Ir pra Prova
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {featured && (
              <QuestCard quest={featured} featured onStart={() => startCollect()} />
            )}
            {otherQuests.map((q) => (
              <QuestCard key={q.id} quest={q} onStart={() => startCollect()} />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={startCollect}
          disabled={collectLoading}
          className="font-hud uppercase mt-8 w-full py-4 rounded-full disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "var(--violet-action)",
            color: "var(--ink-primary)",
            fontSize: "0.8125rem",
            letterSpacing: "0.2em",
          }}
        >
          {collectLoading ? "Preparando coleta..." : "Começar coleta"}
        </button>
        {collectError && (
          <p
            role="alert"
            className="mt-3"
            style={{
              color: "var(--error-wine)",
              fontSize: "0.8125rem",
              lineHeight: 1.5,
            }}
          >
            {collectError}
          </p>
        )}

        <section aria-labelledby="topics-heading" className="mt-12">
          <h2
            id="topics-heading"
            className="font-hud uppercase mb-4"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.6875rem",
              letterSpacing: "0.2em",
            }}
          >
            Tópicos
          </h2>
          {topics.length === 0 ? (
            <p
              style={{
                color: "var(--ink-secondary)",
                fontSize: "0.9375rem",
                fontStyle: "italic",
              }}
            >
              Tópicos aparecem aqui conforme você explora as matérias.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--line-soft)]">
              {topics.map((t) => (
                <li
                  key={`${t.subject}-${t.topic}`}
                  className="flex items-center gap-3 py-3.5"
                >
                  <MasteryDot mastery={t.mastery} />
                  <div className="flex-1 min-w-0">
                    <p
                      style={{
                        color: "var(--ink-primary)",
                        fontSize: "0.9375rem",
                      }}
                      className="truncate"
                    >
                      {t.topic}
                    </p>
                    <p
                      className="font-hud uppercase"
                      style={{
                        color: "var(--ink-tertiary)",
                        fontSize: "0.625rem",
                        letterSpacing: "0.16em",
                      }}
                    >
                      {SUBJECT_LABEL[t.subject]} · {MASTERY_LABEL[t.mastery]}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <TabBar />
    </div>
  );
}

interface StatCellProps {
  label: string;
  value: string | number;
  tone: "violet" | "warn" | "error";
}
function StatCell({ label, value, tone }: StatCellProps) {
  const colorMap = {
    violet: "var(--violet-action)",
    warn: "var(--warn)",
    error: "var(--error-wine)",
  } as const;
  return (
    <div className="surface p-4">
      <p
        className="font-hud uppercase"
        style={{
          color: "var(--ink-tertiary)",
          fontSize: "0.625rem",
          letterSpacing: "0.16em",
        }}
      >
        {label}
      </p>
      <p
        className="font-hud tabular-nums mt-1.5"
        style={{ color: colorMap[tone], fontSize: "1.5rem" }}
      >
        {value}
      </p>
    </div>
  );
}
