"use client";

import { useCallback } from "react";
import { StatusBar } from "../components/hud/StatusBar";
import { TierBadge } from "../components/hud/TierBadge";
import { XpBar } from "../components/hud/XpBar";
import { PowerUpChip } from "../components/hud/PowerUpChip";
import { HeatmapByMatter } from "../components/hud/HeatmapByMatter";
import { LoadErrorState, LoadSkeleton } from "../components/hud/LoadErrorState";
import { TabBar } from "../components/navigation/TabBar";
import { fetchProfile } from "@/lib/api/gamificationClient";
import { useAsyncResource } from "@/lib/hooks/useAsyncResource";
import { useStudentName } from "@/lib/hooks/useStudentName";
import type { Achievement } from "@/lib/gamification/types";
import { SUBJECT_LABEL, getRankMeta } from "@/lib/gamification/types";

function AchievementTile({ achievement }: { achievement: Achievement }) {
  const locked = achievement.unlockedAtIso === null;

  return (
    <div
      className="aspect-square surface flex flex-col items-center justify-center p-3 text-center"
      style={{ opacity: locked ? 0.3 : 1, filter: locked ? "grayscale(1)" : "none" }}
      title={achievement.description}
      aria-label={`${achievement.title}${locked ? " (bloqueada)" : ""}`}
    >
      <svg viewBox="0 0 100 100" width={48} height={48} aria-hidden="true">
        <polygon
          points="50,6 82,30 90,60 50,94 10,60 18,30"
          fill={
            locked
              ? "var(--canvas-surface)"
              : "color-mix(in oklch, var(--gold-accent) 22%, var(--canvas-surface))"
          }
          stroke={locked ? "var(--line)" : "var(--gold-accent)"}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {!locked && (
          <g
            fill="none"
            stroke="oklch(100% 0 0 / 0.22)"
            strokeWidth="1"
            strokeLinejoin="round"
          >
            <polyline points="50,6 50,50 18,30" />
            <polyline points="50,50 82,30" />
            <polyline points="50,50 10,60" />
            <polyline points="50,50 90,60" />
            <polyline points="50,50 50,94" />
          </g>
        )}
      </svg>
      <p
        className="font-hud uppercase mt-2"
        style={{
          color: locked ? "var(--ink-tertiary)" : "var(--ink-primary)",
          fontSize: "0.625rem",
          letterSpacing: "0.08em",
          lineHeight: 1.2,
        }}
      >
        {achievement.title}
      </p>
    </div>
  );
}

export default function PerfilPage() {
  const loadProfile = useCallback(() => fetchProfile(), []);
  const { data: profile, status, reload } = useAsyncResource(loadProfile);
  // The mapper returns "" when child_name is the placeholder "estudante"
  // (fresh Google signups land on that before the UI can pass a real
  // name). Prefer the hook's resolved name (localStorage first, Google
  // metadata second) and only fall back to the profile name when present.
  const { studentName: resolvedName } = useStudentName();

  // Loading state: render a muted skeleton so the user sees *something*
  // within the first frame. No header/TabBar yet because StatusBar needs
  // the profile's tier/xp to paint — showing a fake tier would undermine
  // the whole point of removing the mock fallback.
  if (status === "loading") {
    return (
      <div className="min-h-dvh bg-[var(--canvas-base)] pb-24">
        <main className="mx-auto max-w-lg px-5 pt-8">
          <LoadSkeleton label="Carregando diário de jornada" />
        </main>
        <TabBar />
      </div>
    );
  }

  // Error state: backend failure (Supabase down, migration missing, auth
  // expired, etc.). Show a recoverable empty state with retry. TabBar
  // stays accessible so the user can navigate elsewhere.
  if (status === "error" || !profile) {
    return (
      <div className="min-h-dvh bg-[var(--canvas-base)] pb-24">
        <main className="mx-auto max-w-lg px-5 pt-10">
          <LoadErrorState
            eyebrow="Mochila sumiu"
            message="Mochila sumiu por um segundo. Tenta de novo?"
            onRetry={reload}
          />
        </main>
        <TabBar />
      </div>
    );
  }

  const rankMeta = getRankMeta(profile.tier.rank);
  // Preference order: persisted/Google first name → profile.studentName
  // from the server → "estudante" last-resort. Never show the lowercased
  // "estudante" placeholder when we have a better name available.
  const displayName =
    (resolvedName && resolvedName.trim()) ||
    profile.studentName ||
    "estudante";

  return (
    <div className="min-h-dvh bg-[var(--canvas-base)] pb-24">
      <StatusBar profile={profile} />

      <main className="mx-auto max-w-lg px-5 pt-8">
        <header className="mb-8">
          <p
            className="font-hud uppercase"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.6875rem",
              letterSpacing: "0.2em",
            }}
          >
            Diário de jornada
          </p>
          <h1
            className="font-editorial mt-2"
            style={{
              color: "var(--ink-primary)",
              fontSize: "var(--text-display)",
              lineHeight: 0.98,
              letterSpacing: "-0.02em",
            }}
          >
            {displayName}
            <span
              style={{
                display: "block",
                color: "var(--ink-secondary)",
                fontSize: "1.125rem",
                fontStyle: "italic",
                marginTop: "0.5rem",
              }}
            >
              · {profile.title}
            </span>
          </h1>
          <p
            className="mt-4"
            style={{
              color: "var(--ink-tertiary)",
              fontSize: "0.9375rem",
              lineHeight: 1.5,
              fontStyle: "italic",
            }}
          >
            {rankMeta.lore}
          </p>
        </header>

        <section
          className="surface-elevated p-6 flex flex-col items-center text-center"
          aria-label="XP total"
        >
          <p
            className="font-hud uppercase"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.625rem",
              letterSpacing: "0.22em",
            }}
          >
            XP total
          </p>
          <p
            className="font-hud tabular-nums mt-1.5"
            style={{
              color: "var(--lime-energy)",
              fontSize: "4rem",
              lineHeight: 1,
            }}
          >
            {profile.totalXp.toLocaleString("pt-BR")}
          </p>
          <div className="mt-5 w-full max-w-xs">
            <XpBar
              current={profile.currentXp}
              max={profile.xpForNext}
              showNumbers
              label="Próximo tier"
            />
          </div>
        </section>

        <section aria-labelledby="subjects-heading" className="mt-10">
          <h2
            id="subjects-heading"
            className="font-hud uppercase mb-4"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.6875rem",
              letterSpacing: "0.2em",
            }}
          >
            Matérias
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {profile.subjects.map((s) => (
              <div
                key={s.subject}
                className="surface p-4 flex flex-col items-center gap-3 text-center"
              >
                <TierBadge tier={s.tier} size="large" />
                <p
                  className="font-hud uppercase"
                  style={{
                    color: "var(--ink-primary)",
                    fontSize: "0.75rem",
                    letterSpacing: "0.14em",
                  }}
                >
                  {SUBJECT_LABEL[s.subject]}
                </p>
                <XpBar current={s.currentXp} max={s.xpForNext} />
                <span
                  className="font-hud tabular-nums"
                  style={{
                    color: "var(--ink-secondary)",
                    fontSize: "0.6875rem",
                  }}
                >
                  {s.currentXp} / {s.xpForNext}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="activity-heading" className="mt-10">
          <h2
            id="activity-heading"
            className="font-hud uppercase mb-4"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.6875rem",
              letterSpacing: "0.2em",
            }}
          >
            Trilha dos últimos 7 dias
          </h2>
          <HeatmapByMatter values={profile.activity7d} />
        </section>

        <section aria-labelledby="achievements-heading" className="mt-10">
          <h2
            id="achievements-heading"
            className="font-hud uppercase mb-4"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.6875rem",
              letterSpacing: "0.2em",
            }}
          >
            Conquistas
          </h2>
          {profile.achievements.length === 0 ? (
            // Dia-zero empty state — a silent grid of nothing reads as a
            // bug. Narrate honestly: no bragging tone, no "vamos lá", just
            // a sandbox beat that invites the next action.
            <p
              style={{
                color: "var(--ink-secondary)",
                fontSize: "0.9375rem",
                lineHeight: 1.5,
                fontStyle: "italic",
              }}
            >
              Sem registros ainda. Quando você começar a coletar, vira
              base de dados aqui.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {profile.achievements.map((a) => (
                <AchievementTile key={a.id} achievement={a} />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="inventory-heading" className="mt-10">
          <h2
            id="inventory-heading"
            className="font-hud uppercase mb-4"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.6875rem",
              letterSpacing: "0.2em",
            }}
          >
            Mochila
          </h2>
          {profile.inventory.length === 0 ? (
            <p
              style={{
                color: "var(--ink-secondary)",
                fontSize: "0.9375rem",
                lineHeight: 1.5,
                fontStyle: "italic",
              }}
            >
              Mochila vazia. Power-ups aparecem aqui quando você os coleta.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {profile.inventory.map((p) => (
                <PowerUpChip key={p.id} powerUp={p} />
              ))}
            </div>
          )}
        </section>

        {/*
          LGPD Art. 18, VI — portabilidade de dados. Surfaced here (and
          not just buried in /privacidade) so responsáveis can act on it
          without hunting. Downloads a JSON blob via the rate-limited
          /api/account/export endpoint; plain <a> honours the browser's
          default download behaviour without a framework shell.
        */}
        <section className="mt-12 mb-4 flex justify-center">
          <a
            href="/api/account/export"
            className="font-hud uppercase inline-flex items-center gap-2 px-4 py-2.5 rounded-full border"
            style={{
              borderColor: "var(--line)",
              color: "var(--ink-tertiary)",
              fontSize: "0.625rem",
              letterSpacing: "0.18em",
            }}
          >
            Exportar meus dados
            <span aria-hidden="true" style={{ fontSize: "0.8em" }}>
              ↓
            </span>
          </a>
        </section>
      </main>

      <TabBar />
    </div>
  );
}
