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
        Última atualização: Abril de 2026
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
            5. Compartilhamento de dados
          </h2>
          <p>
            Não vendemos dados pessoais. Compartilhamos dados somente com
            provedores de serviço essenciais (APIs de IA, Sentry, PostHog), sob
            acordos de confidencialidade, e com autoridades quando exigido por
            lei.
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
