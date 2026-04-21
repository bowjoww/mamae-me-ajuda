import Link from "next/link";

export const metadata = {
  title: "Política de Privacidade — Mamãe, me ajuda!",
  description: "Saiba como coletamos, usamos e protegemos seus dados pessoais.",
};

export default function PrivacidadePage() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-8 text-gray-800">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-violet-600 text-sm mb-6 hover:underline"
      >
        ← Voltar ao app
      </Link>

      <h1 className="text-2xl font-bold text-violet-800 mb-1">
        Política de Privacidade
      </h1>
      <p className="text-xs text-gray-500 mb-8">
        Última atualização: 20 de abril de 2026 (v2 — operadores nomeados)
      </p>

      <div className="prose prose-sm prose-violet max-w-none space-y-6 leading-relaxed">
        <section>
          <h2 className="text-base font-bold text-gray-900 mb-2">
            1. Quem somos
          </h2>
          <p>
            O <strong>Mamãe, me ajuda!</strong> é um assistente de estudos com
            inteligência artificial desenvolvido para crianças em idade escolar
            no Brasil.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 mb-2">
            2. Dados coletados
          </h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>
              <strong>Nome da criança</strong> — fornecido pelo responsável no
              início da conversa
            </li>
            <li>
              <strong>Conteúdo das mensagens</strong> — enviado à IA para gerar
              as respostas; não é armazenado permanentemente
            </li>
            <li>
              <strong>Imagens enviadas</strong> — processadas pela IA e não
              armazenadas
            </li>
            <li>
              <strong>Dados de uso anonimizados</strong> — métricas de navegação
              para melhoria do app (via PostHog)
            </li>
            <li>
              <strong>Logs de erro</strong> — informações técnicas para
              estabilidade do app (via Sentry)
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 mb-2">
            3. Dados de menores de idade (LGPD Art. 14)
          </h2>
          <p>
            Nos termos do Art. 14 da Lei 13.709/2018 (LGPD), exigimos{" "}
            <strong>consentimento parental explícito</strong> antes do uso do
            app. O consentimento é solicitado ao responsável legal no primeiro
            acesso e registrado com data, hora e versão da política.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 mb-2">
            4. Finalidade do tratamento
          </h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Personalizar as respostas da tutora com base no nome da criança</li>
            <li>Processar dúvidas escolares via IA</li>
            <li>Melhorar a qualidade e estabilidade do app</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 mb-2">
            5. Compartilhamento de dados e operadores (LGPD Art. 9, IV)
          </h2>
          <p>
            Não vendemos dados pessoais. O conteúdo das mensagens é
            encaminhado aos seguintes operadores, utilizados alternadamente
            ou combinados, sob acordos contratuais que proíbem retenção e
            treinamento de modelos com os dados:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>
              <strong>OpenAI (GPT-5.1)</strong> — geração de respostas.
              Requisições usam <code>store: false</code>.
            </li>
            <li>
              <strong>Google (Gemini)</strong> — geração de respostas.
              Requisições usam <code>store: false</code>.
            </li>
            <li>
              <strong>Sentry</strong> — coleta de logs de erro técnicos
              (sem conteúdo de mensagens).
            </li>
            <li>
              <strong>PostHog</strong> — métricas de uso anonimizadas.
            </li>
            <li>
              <strong>Supabase</strong> — armazenamento do consentimento,
              nome da criança e progresso de estudo.
            </li>
          </ul>
          <p>
            Dados também podem ser compartilhados com autoridades quando
            exigido por lei.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 mb-2">
            6. Seus direitos (LGPD Art. 18)
          </h2>
          <p>
            Você pode solicitar acesso, correção, exclusão ou portabilidade dos
            dados a qualquer momento. Entre em contato:{" "}
            <a
              href="mailto:dpo@mamaemeajuda.com.br"
              className="text-violet-600 underline"
            >
              dpo@mamaemeajuda.com.br
            </a>
          </p>
          <p className="mt-3 text-sm">
            <strong>Portabilidade automática (Art. 18, VI):</strong>{" "}
            se você estiver logado, pode baixar uma cópia completa dos seus
            dados a qualquer momento em{" "}
            <a
              href="/api/account/export"
              className="text-violet-600 underline"
            >
              /api/account/export
            </a>
            . O arquivo JSON inclui seus filhos cadastrados, conversas,
            mensagens, planos de estudo, flashcards, sessões, perfil de
            gamificação e registros de consentimento — tudo o que controlamos
            sobre sua conta. Disponível 1x por hora.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 mb-2">
            7. Segurança
          </h2>
          <p>
            Adotamos criptografia em trânsito (TLS), controle de acesso restrito
            e monitoramento de incidentes de segurança.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-gray-900 mb-2">
            8. Contato
          </h2>
          <p>
            <strong>DPO:</strong>{" "}
            <a
              href="mailto:dpo@mamaemeajuda.com.br"
              className="text-violet-600 underline"
            >
              dpo@mamaemeajuda.com.br
            </a>
            <br />
            <strong>ANPD:</strong>{" "}
            <a
              href="https://www.gov.br/anpd"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-600 underline"
            >
              www.gov.br/anpd
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
