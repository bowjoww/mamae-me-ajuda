"use client";

import { useCallback, useState } from "react";
import {
  CONSENT_POLICY_VERSION,
  saveConsentLocally,
  type ConsentRecord,
} from "@/lib/consent";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

interface ConsentModalProps {
  onAccept: () => void;
}

export function ConsentModal({ onAccept }: ConsentModalProps) {
  const [checked, setChecked] = useState(false);
  const [refused, setRefused] = useState(false);

  // Escape handling: the consent flow is required to use the app (LGPD Art. 14),
  // so Escape moves the user to the explicit "Recusar" screen rather than
  // silently dismissing the dialog.
  const handleEscape = useCallback(() => {
    if (!refused) setRefused(true);
  }, [refused]);

  const dialogRef = useFocusTrap<HTMLDivElement>({
    active: !refused,
    onEscape: handleEscape,
  });

  const refusedRef = useFocusTrap<HTMLDivElement>({
    active: refused,
    onEscape: () => {
      /* terminal state — no further dismissal */
    },
  });

  const handleAccept = async () => {
    if (!checked) return;

    const record: ConsentRecord = {
      accepted: true,
      version: CONSENT_POLICY_VERSION,
      acceptedAt: new Date().toISOString(),
      parentalConsent: true,
    };

    saveConsentLocally(record);

    fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    }).catch(() => {
      // localStorage is authoritative.
    });

    onAccept();
  };

  if (refused) {
    return (
      <div
        ref={refusedRef}
        className="fixed inset-0 flex flex-col items-center justify-center px-6 text-center z-50"
        style={{ background: "var(--canvas-base)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-refused-title"
      >
        <p
          id="consent-refused-title"
          className="font-hud uppercase mb-3"
          style={{
            color: "var(--error-wine)",
            fontSize: "0.6875rem",
            letterSpacing: "0.2em",
          }}
        >
          Sem consentimento, sem acesso
        </p>
        <h2
          className="font-editorial mb-4"
          style={{
            color: "var(--ink-primary)",
            fontSize: "1.75rem",
            lineHeight: 1.1,
            maxWidth: "18rem",
          }}
        >
          O app não pode funcionar sem autorização do responsável.
        </h2>
        <p
          className="max-w-xs leading-relaxed mb-6"
          style={{ color: "var(--ink-secondary)", fontSize: "0.875rem" }}
        >
          Conforme a LGPD (Art. 14), precisamos do consentimento parental
          explícito.
        </p>
        <button
          onClick={() => setRefused(false)}
          className="font-hud uppercase px-5 py-2.5 rounded-full"
          style={{
            background: "var(--violet-action)",
            color: "var(--ink-primary)",
            fontSize: "0.75rem",
            letterSpacing: "0.18em",
          }}
        >
          Voltar aos termos
        </button>
      </div>
    );
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 flex items-end justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      style={{ background: "oklch(0% 0 0 / 0.72)" }}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl px-6 pt-6 pb-8 max-h-[90dvh] overflow-y-auto"
        style={{
          background: "var(--canvas-surface)",
          border: "1px solid var(--line)",
        }}
      >
        <div
          className="w-10 h-1 rounded-full mx-auto mb-5"
          style={{ background: "var(--line)" }}
        />

        <p
          className="font-hud uppercase text-center mb-2"
          style={{
            color: "var(--violet-action)",
            fontSize: "0.625rem",
            letterSpacing: "0.22em",
          }}
        >
          LGPD · Art. 14
        </p>
        <h2
          id="consent-title"
          className="font-editorial text-center mb-5"
          style={{
            color: "var(--ink-primary)",
            fontSize: "1.5rem",
            lineHeight: 1.15,
          }}
        >
          Consentimento Parental
        </h2>

        <div
          className="surface p-4 mb-5 space-y-3"
          style={{
            borderColor: "var(--line-soft)",
            fontSize: "0.875rem",
            color: "var(--ink-primary)",
            lineHeight: 1.55,
          }}
        >
          <p>
            Para usar o <strong>Mamãe, me ajuda!</strong>, precisamos coletar
            alguns dados pessoais:
          </p>
          <ul
            className="list-disc pl-5 space-y-1.5"
            style={{ color: "var(--ink-secondary)" }}
          >
            <li>
              <strong style={{ color: "var(--ink-primary)" }}>
                Nome da criança
              </strong>{" "}
              — personaliza as respostas.
            </li>
            <li>
              <strong style={{ color: "var(--ink-primary)" }}>
                Conteúdo das mensagens
              </strong>{" "}
              — processado por inteligências artificiais de terceiros:{" "}
              <strong style={{ color: "var(--ink-primary)" }}>
                OpenAI (GPT-5.1)
              </strong>{" "}
              e{" "}
              <strong style={{ color: "var(--ink-primary)" }}>
                Google (Gemini)
              </strong>
              , usadas alternadamente ou combinadas. Os dados não são
              retidos por elas (configuramos <em>store: false</em>) nem
              utilizados para treinar modelos.
            </li>
            <li>
              <strong style={{ color: "var(--ink-primary)" }}>
                Dados de uso anonimizados
              </strong>{" "}
              — para melhorar o app.
            </li>
          </ul>
          <p style={{ color: "var(--ink-tertiary)", fontSize: "0.75rem" }}>
            Não vendemos dados. Você pode revogar o consentimento e pedir
            remoção a qualquer momento.{" "}
            <a
              href="/privacidade"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--violet-action)",
                textDecoration: "underline",
                fontWeight: 500,
              }}
            >
              Política de Privacidade
            </a>
            .
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer mb-6">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded-[4px] accent-[var(--violet-action)]"
            aria-label="Aceito os termos e consinto com o uso do aplicativo pela criança"
          />
          <span
            className="leading-snug"
            style={{ color: "var(--ink-primary)", fontSize: "0.875rem" }}
          >
            Sou o responsável legal pela criança e{" "}
            <strong>concordo</strong> com o tratamento dos dados descritos,
            nos termos da Política de Privacidade.
          </span>
        </label>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleAccept}
            disabled={!checked}
            className="font-hud uppercase w-full py-3.5 rounded-full"
            style={{
              background: checked ? "var(--violet-action)" : "var(--line-soft)",
              color: checked ? "var(--ink-primary)" : "var(--ink-tertiary)",
              fontSize: "0.75rem",
              letterSpacing: "0.2em",
              opacity: checked ? 1 : 0.6,
              cursor: checked ? "pointer" : "not-allowed",
            }}
            aria-disabled={!checked}
          >
            Aceitar e continuar
          </button>
          <button
            onClick={() => setRefused(true)}
            className="w-full py-2 font-hud uppercase"
            style={{
              color: "var(--ink-secondary)",
              fontSize: "0.6875rem",
              letterSpacing: "0.18em",
            }}
          >
            Recusar
          </button>
        </div>
      </div>
    </div>
  );
}
