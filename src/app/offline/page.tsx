"use client";

export default function OfflinePage() {
  return (
    <div
      className="flex flex-col items-center justify-center h-dvh px-6 text-center"
      style={{ background: "var(--canvas-base)" }}
    >
      <p
        className="font-hud uppercase mb-3"
        style={{
          color: "var(--warn)",
          fontSize: "0.6875rem",
          letterSpacing: "0.22em",
        }}
      >
        offline
      </p>
      <h1
        className="font-editorial mb-3"
        style={{
          color: "var(--ink-primary)",
          fontSize: "2rem",
          lineHeight: 1.08,
          maxWidth: "20rem",
        }}
      >
        Sem conexão com a internet.
      </h1>
      <p
        className="max-w-xs leading-relaxed mb-6"
        style={{ color: "var(--ink-secondary)", fontSize: "0.875rem" }}
      >
        sem conexão. respira, volta quando der.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="font-hud uppercase px-6 py-3 rounded-full"
        style={{
          background: "var(--violet-action)",
          color: "var(--ink-primary)",
          fontSize: "0.75rem",
          letterSpacing: "0.2em",
        }}
      >
        Tentar de novo
      </button>
    </div>
  );
}
