"use client";

interface XpBarProps {
  current: number;
  max: number;
  showNumbers?: boolean;
  label?: string;
}

export function XpBar({
  current,
  max,
  showNumbers = false,
  label,
}: XpBarProps) {
  const safeMax = Math.max(max, 1);
  const pct = Math.min(100, Math.max(0, (current / safeMax) * 100));

  return (
    <div className="w-full">
      {(showNumbers || label) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <span
              className="font-hud uppercase"
              style={{
                color: "var(--ink-secondary)",
                fontSize: "0.6875rem",
                letterSpacing: "0.12em",
              }}
            >
              {label}
            </span>
          )}
          {showNumbers && (
            <span
              className="font-hud tabular-nums"
              style={{
                color: "var(--ink-primary)",
                fontSize: "0.75rem",
                marginLeft: "auto",
              }}
              aria-label={`Experiência: ${current} de ${max}`}
            >
              {current.toLocaleString("pt-BR")} / {max.toLocaleString("pt-BR")}
            </span>
          )}
        </div>
      )}
      <div
        className="xp-bar-track"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? "Barra de experiência"}
      >
        <div className="xp-bar-fill" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
    </div>
  );
}
