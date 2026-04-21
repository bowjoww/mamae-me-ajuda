"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const INTRO_STORAGE_KEY = "mma.introSeen";

interface AppIntroModalProps {
  studentName: string;
  /** When true, open the modal even if mma.introSeen is set. Used by the
   *  header '?' button so the student can re-read the explainer any time. */
  forceOpen?: boolean;
  /** Fired when the user dismisses a force-opened modal. Parent clears
   *  its forceOpen flag so the normal first-session gate can take over. */
  onClose?: () => void;
}

interface Mode {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const ModeIcon = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <span
    aria-hidden="true"
    className="shrink-0 flex items-center justify-center rounded-full border"
    style={{
      width: 36,
      height: 36,
      borderColor: "var(--line)",
      color: "var(--violet-action)",
    }}
  >
    {children}
  </span>
);

/**
 * First-session explainer. The chat lands the student straight into "Oi,
 * Giovanni! me manda sua dúvida" which is friendly but gives no picture
 * of the other three modes — Board's first tester chatted with the tutor
 * for a while and never discovered /prova, /estudo, /perfil. This modal
 * sets expectations in one screen:
 *   - 4 modos (com ícone + tom curto)
 *   - CTA principal que empurra pra criar a 1ª expedição
 *   - Dismiss persiste em localStorage, não reaparece na vida
 *
 * We intentionally render OVER the chat welcome message instead of
 * replacing it — if the student skips the modal, the chat is still
 * usable underneath.
 */
export function AppIntroModal({
  studentName,
  forceOpen,
  onClose,
}: AppIntroModalProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(INTRO_STORAGE_KEY);
      if (!seen) setOpen(true);
    } catch {
      // localStorage disabled — show the modal once per session anyway.
      setOpen(true);
    }
  }, []);

  // Re-open the modal when the header '?' button flips forceOpen=true.
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const dismiss = (navigateToProva: boolean) => {
    try {
      window.localStorage.setItem(INTRO_STORAGE_KEY, "1");
    } catch {
      // Best-effort only.
    }
    setOpen(false);
    onClose?.();
    if (navigateToProva) router.push("/prova");
  };

  if (!open) return null;

  const modes: Mode[] = [
    {
      icon: (
        <ModeIcon>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H12l-5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-8Z" />
          </svg>
        </ModeIcon>
      ),
      title: "Chat",
      body: "Tira dúvida rápida ou manda foto do exercício. A tutora nunca entrega a resposta — ela puxa você até você entender.",
    },
    {
      icon: (
        <ModeIcon>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6.2A2.2 2.2 0 0 1 6.2 4h11.6A2.2 2.2 0 0 1 20 6.2v11.6A2.2 2.2 0 0 1 17.8 20H6.2A2.2 2.2 0 0 1 4 17.8V6.2Z" />
            <path d="M8 9h8M8 13h5M8 17h3" />
          </svg>
        </ModeIcon>
      ),
      title: "Prova",
      body: "Cria a expedição pra uma prova real: matéria, data, tópicos. Eu monto o plano com trechos do que cai.",
    },
    {
      icon: (
        <ModeIcon>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4 3 9l9 5 9-5-9-5Z" />
            <path d="M7 11v5a5 5 0 0 0 10 0v-5" />
          </svg>
        </ModeIcon>
      ),
      title: "Estudo",
      body: "Todo dia, 5 flashcards. Você lê, tenta resolver no caderno, revela a resposta e diz se acertou. Curto e direto.",
    },
    {
      icon: (
        <ModeIcon>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8.5" r="3.5" />
            <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
          </svg>
        </ModeIcon>
      ),
      title: "Perfil",
      body: "Seu rank e XP. Só sobe quando você estuda de verdade — nada inflado.",
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-heading"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "color-mix(in oklch, var(--canvas-base) 80%, transparent)" }}
    >
      <div
        className="relative w-full max-w-md max-h-[88vh] overflow-y-auto rounded-[18px] border p-6 flex flex-col gap-5"
        style={{
          borderColor: "var(--line)",
          background: "var(--canvas-surface)",
          boxShadow: "0 24px 60px -24px oklch(0% 0 0 / 0.8)",
        }}
      >
        <header className="flex flex-col gap-2">
          <p
            className="font-hud uppercase"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.625rem",
              letterSpacing: "0.22em",
            }}
          >
            Primeiro uso
          </p>
          <h2
            id="intro-heading"
            className="font-editorial"
            style={{
              color: "var(--ink-primary)",
              fontSize: "1.875rem",
              lineHeight: 1.1,
              letterSpacing: "-0.015em",
            }}
          >
            Olá, {studentName}. Em 1 minuto:
          </h2>
        </header>

        <ul className="flex flex-col gap-4" role="list">
          {modes.map((m) => (
            <li key={m.title} className="flex items-start gap-3">
              {m.icon}
              <div className="flex-1 min-w-0">
                <p
                  className="font-editorial"
                  style={{
                    color: "var(--ink-primary)",
                    fontSize: "1rem",
                    lineHeight: 1.25,
                  }}
                >
                  {m.title}
                </p>
                <p
                  style={{
                    color: "var(--ink-secondary)",
                    fontSize: "0.8125rem",
                    lineHeight: 1.45,
                    marginTop: 2,
                  }}
                >
                  {m.body}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <p
          className="rounded-[10px] p-3"
          style={{
            background: "color-mix(in oklch, var(--violet-action) 8%, var(--canvas-base))",
            color: "var(--ink-primary)",
            fontSize: "0.8125rem",
            lineHeight: 1.5,
            border: "1px solid color-mix(in oklch, var(--violet-action) 30%, var(--line))",
          }}
        >
          <strong>Dica:</strong> começa pela <strong>Prova</strong>. Assim eu monto tua trilha e o Estudo já vem recheado de flashcards.
        </p>

        <footer className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => dismiss(true)}
            className="font-hud uppercase w-full py-3 rounded-full transition-colors"
            style={{
              background: "var(--violet-action)",
              color: "var(--ink-primary)",
              fontSize: "0.75rem",
              letterSpacing: "0.18em",
            }}
          >
            Começar pela Prova
          </button>
          <button
            type="button"
            onClick={() => dismiss(false)}
            className="font-hud uppercase w-full py-3 rounded-full border transition-colors"
            style={{
              borderColor: "var(--line)",
              color: "var(--ink-secondary)",
              fontSize: "0.75rem",
              letterSpacing: "0.18em",
              background: "transparent",
            }}
          >
            Só ver o chat agora
          </button>
        </footer>
      </div>
    </div>
  );
}
