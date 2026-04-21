"use client";

interface LoadErrorStateProps {
  /** Short, calibrated message (sandbox/crafting tone). Keep under 10 words. */
  message: string;
  /** Callback for the "Tentar de novo" button. */
  onRetry: () => void;
  /** Optional eyebrow label above the message. */
  eyebrow?: string;
}

/**
 * Error state rendered inside a page's main column when a data-fetch
 * fails. Not a full-page takeover — header (StatusBar) and TabBar stay
 * accessible around it so the user can navigate away.
 *
 * Tone: sandbox/crafting, honest, not cringe. Copy calibrated by the
 * page that owns the state (see /perfil, /estudo, /prova).
 */
export function LoadErrorState({
  message,
  onRetry,
  eyebrow = "Sinal perdido",
}: LoadErrorStateProps) {
  return (
    <section
      role="alert"
      aria-live="polite"
      className="surface p-6 mt-6 flex flex-col items-start gap-4"
      style={{ borderColor: "var(--line)" }}
    >
      <p
        className="font-hud uppercase"
        style={{
          color: "var(--warn)",
          fontSize: "0.6875rem",
          letterSpacing: "0.2em",
        }}
      >
        {eyebrow}
      </p>
      <p
        className="font-editorial"
        style={{
          color: "var(--ink-primary)",
          fontSize: "1.25rem",
          lineHeight: 1.3,
          maxWidth: "20rem",
        }}
      >
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="font-hud uppercase px-5 py-2.5 rounded-full border border-[var(--violet-action)]"
        style={{
          color: "var(--violet-action)",
          fontSize: "0.75rem",
          letterSpacing: "0.18em",
        }}
      >
        Tentar de novo
      </button>
    </section>
  );
}

/**
 * Skeleton shown while an async resource is loading. Subtle pulse, no
 * phantom data. Intended to live inside the same space the real content
 * will occupy after load.
 */
export function LoadSkeleton({ label = "Carregando" }: { label?: string }) {
  return (
    <div
      className="mt-8 flex flex-col gap-4"
      aria-busy="true"
      aria-label={label}
    >
      <div
        className="surface skeleton-block h-24"
        style={{ borderColor: "var(--line-soft)" }}
      />
      <div
        className="surface skeleton-block h-16"
        style={{ borderColor: "var(--line-soft)" }}
      />
      <div
        className="surface skeleton-block h-16"
        style={{ borderColor: "var(--line-soft)" }}
      />
    </div>
  );
}
