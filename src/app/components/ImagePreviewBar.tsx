interface ImagePreviewBarProps {
  imagePreview: string;
  onRemove: () => void;
}

export function ImagePreviewBar({ imagePreview, onRemove }: ImagePreviewBarProps) {
  return (
    <div
      className="px-4 py-2 shrink-0"
      style={{
        background: "var(--canvas-surface)",
        borderTop: "1px solid var(--line-soft)",
      }}
    >
      <div className="relative inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagePreview}
          alt="Pré-visualização da imagem selecionada"
          className="h-16 rounded-lg"
          style={{ border: "1px solid var(--violet-action)" }}
        />
        {/*
          Touch target must be ≥44×44px per WCAG 2.1 Target Size (2.5.5).
          We keep the *visible* red pill compact (20×20) and expand the
          hit area using padding + min dimensions. The visible indicator
          is rendered by the inner `span.dot`; the button itself is
          transparent outside that dot, so the design reads the same but
          fingers/styluses get a real target.
        */}
        <button
          onClick={onRemove}
          className="absolute -top-3 -right-3 flex items-center justify-center min-w-[44px] min-h-[44px]"
          style={{ background: "transparent", padding: 0 }}
          aria-label="Remover imagem selecionada"
        >
          <span
            className="rounded-full w-5 h-5 flex items-center justify-center font-hud shadow"
            style={{
              background: "var(--error-wine)",
              color: "var(--ink-primary)",
              fontSize: "0.6875rem",
            }}
            aria-hidden="true"
          >
            ×
          </span>
        </button>
      </div>
    </div>
  );
}
