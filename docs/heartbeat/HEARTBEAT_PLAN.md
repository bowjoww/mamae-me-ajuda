# Heartbeat Operations — `mamae-me-ajuda`

> Modo de trabalho autônomo iniciado em 2026-05-15. Continua rodando até o user (Giovanni / jofederici@gmail.com) dizer "para" / "stop" / "cancela".

## Persona do produto
- **Usuário primário**: Henrique, 12 anos, 7º ano Colégio Impacto, joga Roblox/Minecraft/Don't Starve. EdTech focado em provas AV2 (discursivas).
- **Decisor**: Giovanni (padrasto, Board).
- **Stack**: Next.js 16 (App Router, Turbopack) · React 19 · Supabase (auth/RLS/postgres) · OpenAI GPT-5.1 (com flag pra GPT-5.5 via env) · Gemini 2.5 Flash (default no chat) · Vercel.
- **Branch ativa**: `feat/modo-prova-estudo-henrique`. Prod = `mamaemeajuda.joowesports.com`.

## Estado de entrega ao iniciar este loop
- Último deploy prod: sha `8a4ede2` (NaN fix + markdown debrief).
- **Hotfix preview pendente** (sha `bb8c5b2`): 3 bugs do uso real do Henrique — chat 500 logging, StatusBar fresh-start, /prova "Trocar prova". **Aguarda autorização do user pra promover.**
- **Env var pendente**: `OPENAI_MODEL=gpt-5.5-2026-04-23` + `AI_PROVIDER=openai`. Aguarda autorização do user.

## Eixos de trabalho do loop

### 1. Audit (descobrir)
- [ ] Security review (kids app + PII + auth)
- [ ] Accessibility WCAG 2.2
- [ ] Legal compliance (LGPD Brasil, COPPA US, GDPR-K UE)
- [ ] Performance / Core Web Vitals
- [ ] Code review dos arquivos mais tocados
- [ ] UX audit final (already done in earlier sessions — não repetir, consultar)

### 2. Polish (corrigir)
- [ ] Promover hotfix bb8c5b2 pra prod (precisa auth)
- [ ] Swap pra GPT-5.5 (precisa auth + verificar acesso da key)
- [ ] Implementar findings críticos de audit (sem auth pra novos arquivos; com auth pra mudanças em prod)
- [ ] Reduzir débito técnico: ESLint errors em `src/app/page.tsx:68` e `src/lib/hooks/useStudentName.ts:43` (`react-hooks/set-state-in-effect`)

### 3. Commercialization (expandir)
- [ ] Posicionamento de marca (Brand Guardian)
- [ ] Roadmap de produto pós-Henrique (Product Manager)
- [ ] Pricing & monetization (Growth Hacker)
- [ ] GTM Brasil — onde estão pais como o Giovanni
- [ ] Compliance pra commercialização B2C com menores

### 4. Mobile (escalar)
- [ ] Scoping Android/iOS — PWA vs Capacitor vs React Native
- [ ] ASO prep (App Store Optimizer)
- [ ] Push notifications strategy (PWA support hoje?)

## Cadência do loop
- Cada heartbeat: 1 batch de agentes em paralelo + consolidação + commit dos artefatos.
- Agents produzem markdown em `docs/audit/<area>.md` e `docs/commercialization/<area>.md`.
- Decisões que precisam autorização do user (prod deploys, env vars, mudanças destrutivas) ficam em `docs/heartbeat/PENDING_AUTH.md`.

## Regras de segurança no loop
- **Não promover pra prod sem autorização explícita** (mesmo em auto mode).
- **Não rodar migrations destrutivas** sem autorização.
- **Não rotacionar secrets** sem autorização.
- **Não fazer push direto pra `main`** — mantém na branch atual.
- Tudo que precisar autorização entra em `PENDING_AUTH.md` pro user decidir quando voltar.
