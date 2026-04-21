"use client";

import type { ReactNode } from "react";
import type { PowerUp } from "@/lib/gamification/types";

interface PowerUpChipProps {
  powerUp: PowerUp;
  onUse?: (powerUp: PowerUp) => void;
}

/**
 * Per-power-up inline SVG icons. Line-based, 2D-friendly, geometrically
 * flat so they sit in the mono/serif grid without looking like a stock
 * Lucide tile. Inspired by sandbox crafting inventories but not pastiched.
 */
const ICON: Record<string, ReactNode> = {
  // Tocha — ilumina 1 passo. Handle + flame.
  tocha: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-full h-full">
      <path d="M10 13h4v7h-4z" />
      <path d="M12 3c1.5 2 3 3.5 3 6a3 3 0 0 1-6 0c0-2.5 1.5-4 3-6Z" />
      <path d="M12 7v3" />
    </svg>
  ),
  // Bússola — ring + needle.
  bussola: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-full h-full">
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-2 5-5 2 2-5 5-2Z" />
    </svg>
  ),
  // Livro de Receitas — aberto com marcador.
  livro: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-full h-full">
      <path d="M3 5h7a3 3 0 0 1 2 1 3 3 0 0 1 2-1h7v13h-7a3 3 0 0 0-2 1 3 3 0 0 0-2-1H3V5Z" />
      <path d="M12 6v13" />
      <path d="M6 9h3M6 12h3M15 9h3M15 12h3" />
    </svg>
  ),
  // Pedra de Retorno — hexagonal stone with a dot in the center.
  pedra: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="w-full h-full">
      <polygon points="12,3 20,7 20,17 12,21 4,17 4,7" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
};

/**
 * Map a power-up row (either by canonical slug id or free-form name) onto
 * one of the known icon keys. Defensive — falls back to a generic sparkle
 * if we receive something unknown, keeping the UI intact.
 */
function resolveIconKey(powerUp: PowerUp): string {
  const id = powerUp.id.toLowerCase();
  if (id.includes("tocha") || id.includes("dica")) return "tocha";
  if (id.includes("bussola") || id.includes("relampago") || id.includes("revisao")) return "bussola";
  if (id.includes("livro") || id.includes("receita") || id.includes("insight")) return "livro";
  if (id.includes("pedra") || id.includes("retorno") || id.includes("chance")) return "pedra";

  const name = powerUp.name.toLowerCase();
  if (name.includes("tocha")) return "tocha";
  if (name.includes("bússola") || name.includes("bussola")) return "bussola";
  if (name.includes("livro")) return "livro";
  if (name.includes("pedra")) return "pedra";
  return "tocha";
}

export function PowerUpChip({ powerUp, onUse }: PowerUpChipProps) {
  const disabled = powerUp.charges <= 0;
  const iconKey = resolveIconKey(powerUp);

  return (
    <div
      className="surface p-4 flex flex-col gap-2"
      aria-label={`Item de mochila: ${powerUp.name}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="shrink-0 w-9 h-9 rounded-[8px] flex items-center justify-center"
            style={{
              border: "1px solid var(--line)",
              background:
                "color-mix(in oklch, var(--canvas-base) 60%, var(--canvas-surface))",
              color: "var(--ink-primary)",
              padding: 6,
            }}
            aria-hidden="true"
          >
            {ICON[iconKey]}
          </span>
          <span
            className="font-hud uppercase truncate"
            style={{
              color: "var(--ink-primary)",
              fontSize: "0.75rem",
              letterSpacing: "0.14em",
            }}
          >
            {powerUp.name}
          </span>
        </div>
        <span
          className="font-hud tabular-nums shrink-0"
          style={{ color: "var(--lime-energy)", fontSize: "0.75rem" }}
          aria-label={`${powerUp.charges} cargas restantes`}
        >
          ×{powerUp.charges}
        </span>
      </div>
      <p
        style={{
          color: "var(--ink-secondary)",
          fontSize: "0.8125rem",
          lineHeight: 1.45,
        }}
      >
        {powerUp.description}
      </p>
      {onUse && (
        <button
          type="button"
          onClick={() => onUse(powerUp)}
          disabled={disabled}
          className="font-hud uppercase self-start mt-1 px-3 py-1.5 rounded-full border"
          style={{
            borderColor: disabled
              ? "var(--line-soft)"
              : "var(--violet-action)",
            color: disabled ? "var(--ink-tertiary)" : "var(--violet-action)",
            fontSize: "0.625rem",
            letterSpacing: "0.16em",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          Usar
        </button>
      )}
    </div>
  );
}
