"use client";

import type { Rank, TierBadgeData } from "@/lib/gamification/types";
import { RANK_LABEL, RANK_META } from "@/lib/gamification/types";

interface TierBadgeProps {
  tier: TierBadgeData;
  size?: "inline" | "large";
  label?: boolean;
}

const INLINE_SIZE = 24;
const LARGE_SIZE = 96;

/**
 * A faceted gem / ore sliver with a matte bevel. The geometry is a
 * six-sided crystal (top point, four body faces, bottom point) instead of
 * the older flat hex — it reads more like something you'd find in an ore
 * vein than a tactical sticker. Division (I/II/III) sits in mono in the
 * bottom corner.
 */
export function TierBadge({
  tier,
  size = "inline",
  label = false,
}: TierBadgeProps) {
  const px = size === "inline" ? INLINE_SIZE : LARGE_SIZE;
  const color = RANK_META[tier.rank as Rank]?.color ?? "var(--rank-aprendiz)";
  const a11yLabel = `Tier ${RANK_LABEL[tier.rank]} ${tier.division}`;
  const gradId = `gem-grad-${tier.rank}-${size}`;
  const grainId = `gem-grain-${tier.rank}-${size}`;

  return (
    <div
      className="inline-flex items-center gap-2"
      aria-label={a11yLabel}
      role="img"
    >
      <span
        className="relative inline-block align-middle shrink-0"
        style={{ width: px, height: px }}
      >
        <svg
          viewBox="0 0 100 100"
          width={px}
          height={px}
          aria-hidden="true"
          style={{
            filter:
              "drop-shadow(0 2px 5px oklch(0% 0 0 / 0.55)) drop-shadow(0 0 0 var(--line))",
          }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.95" />
              <stop offset="55%" stopColor={color} stopOpacity="0.6" />
              <stop offset="100%" stopColor={color} stopOpacity="0.85" />
            </linearGradient>
            <pattern
              id={grainId}
              x="0"
              y="0"
              width="4"
              height="4"
              patternUnits="userSpaceOnUse"
            >
              <rect width="4" height="4" fill="transparent" />
              <circle cx="1" cy="1" r="0.35" fill="#000" opacity="0.14" />
            </pattern>
          </defs>

          {/* Gem body — 6-sided crystal silhouette */}
          <polygon
            points="50,6 82,30 90,60 50,94 10,60 18,30"
            fill={`url(#${gradId})`}
            stroke="var(--line)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Grain overlay for matte finish */}
          <polygon
            points="50,6 82,30 90,60 50,94 10,60 18,30"
            fill={`url(#${grainId})`}
            strokeLinejoin="round"
          />
          {/* Internal facets — the crystal's cut lines */}
          <g
            fill="none"
            stroke="oklch(100% 0 0 / 0.18)"
            strokeWidth="1"
            strokeLinejoin="round"
          >
            <polyline points="50,6 50,48 18,30" />
            <polyline points="50,48 82,30" />
            <polyline points="50,48 10,60" />
            <polyline points="50,48 90,60" />
            <polyline points="50,48 50,94" />
          </g>
          {/* Inner bevel highlight */}
          <polygon
            points="50,14 76,32 82,56 50,82 18,56 24,32"
            fill="none"
            stroke="oklch(100% 0 0 / 0.10)"
            strokeWidth="1"
          />
        </svg>
        <span
          className="font-hud absolute"
          style={{
            color: "var(--ink-primary)",
            fontSize: size === "inline" ? "0.6875rem" : "1.25rem",
            letterSpacing: "0.08em",
            textShadow: "0 1px 2px oklch(0% 0 0 / 0.6)",
            right: size === "inline" ? "18%" : "22%",
            bottom: size === "inline" ? "20%" : "18%",
          }}
        >
          {tier.division}
        </span>
      </span>
      {label && (
        <span
          className="font-hud uppercase"
          style={{
            color: "var(--ink-primary)",
            fontSize: size === "inline" ? "0.6875rem" : "0.875rem",
            letterSpacing: "0.12em",
          }}
        >
          {RANK_LABEL[tier.rank]} {tier.division}
        </span>
      )}
    </div>
  );
}
