"use client";

import { useState } from "react";
import {
  CONSENT_POLICY_VERSION,
  saveConsentLocally,
  type ConsentRecord,
} from "@/lib/consent";

interface ConsentModalProps {
  onAccept: () => void;
}

export function ConsentModal({ onAccept }: ConsentModalProps) {
  const [checked, setChecked] = useState(false);
  const [refused, setRefused] = useState(false);

  const handleAccept = async () => {
    if (!checked) return;

    const record: ConsentRecord = {
      accepted: true,
      version: CONSENT_POLICY_VERSION,
      acceptedAt: new Date().toISOString(),
      parentalConsent: true,
    };

    saveConsentLocally(record);

    // Best-effort: persist to backend (non-blocking)
    fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    }).catch(() => {
      // Ignore network errors — localStorage is authoritative
    });

    onAccept();
  };

  const handleRefuse = () => {
    setRefused(true);
  };

  if (refused) {
    return (
      <div className="fixed inset-0 bg-violet-50 flex flex-col items-center justify-center px-6 text-center z-50">
        <div className="text-6xl mb-4" role="img" aria-label="Triste">
          😔
        </div>
        <h2 className="text-xl font-bold text-violet-800 mb-3">
          Sem consentimento, sem acesso
        </h2>
        <p className="text-violet-600 text-sm max-w-xs leading-relaxed mb-6">
          O <strong>Mamãe, me ajuda!</strong> não pode funcionar sem o
          consentimento do responsável legal, conforme exigido pela LGPD (Art.
          14).
        </p>
        <p className="text-violet-500 text-xs max-w-xs leading-relaxed mb-6">
          Se mudou de ideia, clique abaixo para rever os termos.
        </p>
        <button
          onClick={() => setRefused(false)}
          className="bg-violet-600 text-white font-semibold px-5 py-2.5 rounded-2xl shadow-md"
        >
          Voltar aos termos
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
    >
      <div className="bg-white w-full max-w-lg rounded-t-3xl px-6 pt-6 pb-8 shadow-2xl max-h-[90dvh] overflow-y-auto">
        {/* Handle bar */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        <div className="text-3xl text-center mb-3" role="img" aria-label="Cadeado">
          🔒
        </div>
        <h2
          id="consent-title"
          className="text-lg font-bold text-center text-gray-900 mb-1"
        >
          Consentimento Parental
        </h2>
        <p className="text-xs text-center text-gray-500 mb-5">
          Conforme a LGPD — Art. 14 (Lei 13.709/2018)
        </p>

        <div className="bg-violet-50 rounded-2xl p-4 mb-5 space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            Para usar o <strong>Mamãe, me ajuda!</strong>, precisamos coletar
            alguns dados pessoais:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-gray-600">
            <li>
              <strong>Nome da criança</strong> — para personalizar as respostas
              da tutora
            </li>
            <li>
              <strong>Conteúdo das mensagens</strong> — enviado à IA para gerar
              as respostas
            </li>
            <li>
              <strong>Dados de uso anonimizados</strong> — para melhorar o app
            </li>
          </ul>
          <p className="text-gray-500 text-xs">
            Não vendemos dados. Os dados são tratados conforme nossa{" "}
            <a
              href="/privacidade"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-600 underline font-medium"
            >
              Política de Privacidade
            </a>
            .
          </p>
        </div>

        {/* Explicit consent checkbox */}
        <label className="flex items-start gap-3 cursor-pointer mb-6">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-gray-300 text-violet-600 accent-violet-600 shrink-0"
            aria-label="Aceito os termos e consinto com o uso do aplicativo pela criança"
          />
          <span className="text-sm text-gray-700 leading-snug">
            Sou o responsável legal pela criança e <strong>concordo</strong> com
            o tratamento dos dados pessoais descritos acima, nos termos da
            Política de Privacidade.
          </span>
        </label>

        <div className="flex flex-col gap-3">
          <button
            onClick={handleAccept}
            disabled={!checked}
            className="w-full bg-violet-600 text-white font-bold py-3.5 rounded-2xl shadow-md disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
            aria-disabled={!checked}
          >
            Aceitar e continuar
          </button>
          <button
            onClick={handleRefuse}
            className="w-full text-gray-500 text-sm py-2 hover:text-gray-700"
          >
            Recusar
          </button>
        </div>
      </div>
    </div>
  );
}
