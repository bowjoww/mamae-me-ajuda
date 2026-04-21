"use client";

import { useState } from "react";

interface HeatmapByMatterProps {
  values: number[]; // minutes per day, most recent last
  label?: string;
}

const WEEKDAY = ["D", "S", "T", "Q", "Q", "S", "S"]; // Sun..Sat

function cellColor(value: number, max: number): string {
  if (value === 0) return "var(--line-soft)";
  const ratio = Math.min(1, value / Math.max(max, 1));
  // 20%..95% opacity of violet
  const alpha = 0.2 + 0.75 * ratio;
  return `color-mix(in oklch, var(--violet-action) ${Math.round(
    alpha * 100
  )}%, transparent)`;
}

export function HeatmapByMatter({ values, label }: HeatmapByMatterProps) {
  const [focused, setFocused] = useState<number | null>(null);
  const max = Math.max(...values, 1);

  const today = new Date();
  const todayDow = today.getDay(); // 0..6

  return (
    <div aria-label={label ?? "Atividade dos últimos 7 dias"}>
      {label && (
        <span
          className="font-hud uppercase block mb-3"
          style={{
            color: "var(--ink-secondary)",
            fontSize: "0.6875rem",
            letterSpacing: "0.14em",
          }}
        >
          {label}
        </span>
      )}
      <div className="flex items-end gap-1.5" role="row">
        {values.map((v, i) => {
          const dow = (todayDow - (values.length - 1 - i) + 7 * 2) % 7;
          const dayKey = WEEKDAY[dow];
          const isFocused = focused === i;
          return (
            <button
              key={`day-${i}-${dayKey}`}
              type="button"
              onFocus={() => setFocused(i)}
              onBlur={() => setFocused(null)}
              onMouseEnter={() => setFocused(i)}
              onMouseLeave={() => setFocused(null)}
              // WCAG 2.2 SC 2.4.11 Focus Not Obscured & SC 2.4.13 Focus
              // Appearance — the global :focus-visible ring in globals.css
              // now applies (the inline outline:none override was removed).
              className="heatmap-cell flex flex-col items-center gap-1.5"
              aria-label={`${dayKey}: ${v} minutos de coleta`}
            >
              <span
                className="block rounded-[4px]"
                style={{
                  width: 24,
                  height: 40,
                  background: cellColor(v, max),
                  border: isFocused
                    ? "1px solid var(--violet-action)"
                    : "1px solid transparent",
                  transition:
                    "border-color 240ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
              <span
                className="font-hud"
                style={{
                  color: isFocused
                    ? "var(--ink-primary)"
                    : "var(--ink-tertiary)",
                  fontSize: "0.625rem",
                  letterSpacing: "0.12em",
                }}
              >
                {dayKey}
              </span>
            </button>
          );
        })}
      </div>
      {focused !== null && (
        <p
          className="font-hud mt-3"
          style={{ color: "var(--ink-secondary)", fontSize: "0.75rem" }}
          role="status"
        >
          {values[focused]} min
        </p>
      )}
    </div>
  );
}
