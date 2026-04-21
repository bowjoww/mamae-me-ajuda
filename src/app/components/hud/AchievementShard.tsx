"use client";

import { useCallback, useEffect, useState } from "react";
import type { Achievement } from "@/lib/gamification/types";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

interface AchievementShardProps {
  achievement: Achievement;
  open: boolean;
  onDismiss: () => void;
}

/**
 * Achievement banner — slides down from the top, sits for ~2s, resolves on
 * click, Escape key, or programmatic dismiss. Replaces the older
 * "shard reveal" full-screen shard animation. The visual language now
 * matches a crafting / sandbox toast: small wooden plaque, quiet entrance,
 * no sparks.
 *
 * Accessibility:
 *  - `role="dialog"` + focus trap while open (WCAG 2.2 SC 2.4.3 Focus Order).
 *  - Escape key closes (SC 2.1.1 Keyboard).
 *  - Backdrop remains clickable for pointer users, but the dedicated
 *    "Fechar" button (plus Escape) provides the keyboard equivalent
 *    (SC 2.1.1 Keyboard Equivalents).
 *
 * Component name preserved so existing imports and tests keep working.
 */
export function AchievementShard({
  achievement,
  open,
  onDismiss,
}: AchievementShardProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Track whether the banner has ever been opened so we can keep rendering
    // during the fade-out animation even after `open` flips to false.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setMounted(true);
  }, [open]);

  const handleEscape = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  const bannerRef = useFocusTrap<HTMLDivElement>({
    active: open,
    onEscape: handleEscape,
  });

  if (!open && !mounted) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shard-title"
      onClick={onDismiss}
      style={{ background: "oklch(0% 0 0 / 0.55)" }}
    >
      <div
        ref={bannerRef}
        className="achievement-banner fixed left-1/2 top-6 px-5 py-4 flex items-center gap-4 max-w-sm w-[calc(100%-2rem)]"
        style={{
          transform: "translateX(-50%)",
          background: "color-mix(in oklch, var(--canvas-surface) 92%, var(--canvas-base))",
          border: "1px solid var(--gold-accent)",
          borderRadius: 10,
          boxShadow: "0 20px 40px -20px oklch(0% 0 0 / 0.75)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ore icon — small, matches the tier badge family */}
        <svg
          width={44}
          height={44}
          viewBox="0 0 100 100"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <defs>
            <linearGradient id="shard-banner-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold-accent)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--violet-action)" stopOpacity="0.75" />
            </linearGradient>
          </defs>
          <polygon
            points="50,8 82,30 90,60 50,92 10,60 18,30"
            fill="url(#shard-banner-grad)"
            stroke="var(--line)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <g
            fill="none"
            stroke="oklch(100% 0 0 / 0.22)"
            strokeWidth="1"
            strokeLinejoin="round"
          >
            <polyline points="50,8 50,50 18,30" />
            <polyline points="50,50 82,30" />
            <polyline points="50,50 10,60" />
            <polyline points="50,50 90,60" />
            <polyline points="50,50 50,92" />
          </g>
        </svg>

        <div className="min-w-0 flex-1">
          <p
            className="font-hud uppercase"
            style={{
              color: "var(--gold-accent)",
              fontSize: "0.625rem",
              letterSpacing: "0.2em",
            }}
          >
            Conquista desbloqueada
          </p>
          <h2
            id="shard-title"
            className="font-editorial truncate"
            style={{
              color: "var(--ink-primary)",
              fontSize: "1.125rem",
              lineHeight: 1.2,
              marginTop: "0.125rem",
            }}
          >
            {achievement.title}
          </h2>
          <p
            className="truncate"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.75rem",
              lineHeight: 1.35,
              marginTop: "0.125rem",
            }}
          >
            {achievement.description}
          </p>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="font-hud uppercase shrink-0 px-3 py-1.5 border border-[var(--line)] rounded-full"
          style={{
            color: "var(--ink-primary)",
            fontSize: "0.625rem",
            letterSpacing: "0.16em",
          }}
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
