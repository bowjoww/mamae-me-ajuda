"use client";

import type { Profile } from "@/lib/gamification/types";
import { RANK_LABEL } from "@/lib/gamification/types";
import { TierBadge } from "./TierBadge";
import { XpBar } from "./XpBar";

interface StatusBarProps {
  profile: Pick<
    Profile,
    "tier" | "currentXp" | "xpForNext" | "streak" | "totalXp"
  >;
  variant?: "hub" | "arena";
}

export function StatusBar({ profile, variant = "hub" }: StatusBarProps) {
  const paddingY = variant === "arena" ? "py-3.5" : "py-2.5";
  const bg =
    variant === "arena" ? "bg-[var(--arena-base)]" : "bg-[var(--canvas-base)]";

  // Fresh accounts land on rank=aprendiz division=III with totalXp=0. The
  // Roman III reads as "level 3" to non-gamer parents and confuses kids
  // about whether they've made progress they haven't. Until the first
  // earned XP, drop the division entirely and show just the rank — the
  // division pip reveals as soon as there's something to celebrate.
  const isFreshStart = (profile.totalXp ?? 0) === 0;
  const tierLabel = isFreshStart
    ? RANK_LABEL[profile.tier.rank]
    : `${RANK_LABEL[profile.tier.rank]} ${profile.tier.division}`;

  return (
    <header
      className={`sticky top-0 z-30 ${bg} border-b border-[var(--line-soft)] ${paddingY} px-4`}
      aria-label="Status do jogador"
    >
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <TierBadge tier={profile.tier} size="inline" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className="font-hud uppercase truncate"
              style={{
                color: "var(--ink-primary)",
                fontSize: "0.6875rem",
                letterSpacing: "0.16em",
              }}
            >
              {tierLabel}
            </span>
            <span
              className="font-hud tabular-nums"
              style={{ color: "var(--ink-secondary)", fontSize: "0.6875rem" }}
              aria-label={`Sequência: ${profile.streak.days} dias`}
            >
              {profile.streak.days}d
            </span>
          </div>
          <div className="mt-1.5">
            <XpBar current={profile.currentXp} max={profile.xpForNext} />
          </div>
        </div>
      </div>
    </header>
  );
}
