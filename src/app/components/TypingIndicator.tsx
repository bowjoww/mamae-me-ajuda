export function TypingIndicator() {
  return (
    <div
      className="message-appear flex justify-start"
      role="status"
      aria-label="Tutora está pensando"
    >
      <div
        className="surface flex items-center gap-1.5 rounded-2xl px-4 py-3"
        style={{ borderColor: "var(--line-soft)" }}
      >
        <span
          className="font-hud uppercase mr-1"
          aria-hidden="true"
          style={{
            color: "var(--ink-secondary)",
            fontSize: "0.625rem",
            letterSpacing: "0.18em",
          }}
        >
          Pensando
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full dot-1 inline-block"
          aria-hidden="true"
          style={{ background: "var(--violet-action)" }}
        ></span>
        <span
          className="w-1.5 h-1.5 rounded-full dot-2 inline-block"
          aria-hidden="true"
          style={{ background: "var(--violet-action)" }}
        ></span>
        <span
          className="w-1.5 h-1.5 rounded-full dot-3 inline-block"
          aria-hidden="true"
          style={{ background: "var(--violet-action)" }}
        ></span>
      </div>
    </div>
  );
}
