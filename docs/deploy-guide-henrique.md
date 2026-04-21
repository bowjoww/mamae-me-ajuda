# Deploy Guide — Entrega pro Henrique

Guia executável pra ligar o produto em prod e provisionar a conta do Henrique a
tempo da prova de matemática de **quinta 23/04**.

> Complementa [`deploy-runbook.md`](./deploy-runbook.md) (manual técnico
> genérico). Aqui o foco é a ativação ponta-a-ponta do piloto com 1 usuário.

---

## 1. Pré-requisitos

Acesso a: Vercel (owner), Supabase prod, OpenAI API key, Sentry, PostHog,
Upstash Redis, repo `mamae-me-ajuda`. Local: Node 20+, `npm`, `supabase` CLI,
branch `master` atualizada.

---

## 2. Aplicar migrations (Supabase)

Ordem: **003 → 004 → 005 → 006**. Baseline (001, 002) já em prod.

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

Alternativa manual (recomendado pra piloto — aplicar um por vez):

```bash
psql $DATABASE_URL -f supabase/migrations/003_study_and_gamification.sql
psql $DATABASE_URL -f supabase/migrations/004_rebrand_ranks.sql
psql $DATABASE_URL -f supabase/migrations/005_power_up_atomic.sql
psql $DATABASE_URL -f supabase/migrations/006_sm2_due_at_default.sql
```

### Verificação obrigatória (SQL)

```sql
select count(*) from public.achievements_catalog; -- >= 13
select count(*) from public.power_ups;             -- >= 4

-- RLS em todas tabelas novas (todas devem retornar t)
select relname, relrowsecurity from pg_class
 where relnamespace='public'::regnamespace and relkind='r'
   and relname in ('study_plans','study_topics','flashcards','study_sessions',
                   'user_profile','xp_events','user_achievements','quests',
                   'power_ups','user_inventory','achievements_catalog');

-- RPCs atômicas (ambos devem retornar t)
select has_function_privilege('authenticated', 'public.award_xp(uuid,integer,public.xp_reason,jsonb)', 'execute');
select has_function_privilege('authenticated', 'public.consume_power_up(uuid,text)', 'execute');
```

Se qualquer falhar: **não avance**.

---

## 3. Configurar env vars no Vercel

Dashboard → Project → Settings → Environment Variables.

| Variável | Valor | Crítica |
|---|---|---|
| `AI_PROVIDER` | `openai` | **SIM** (default é `gemini` — veja §9) |
| `OPENAI_API_KEY` | `sk-...` | **SIM** |
| `GEMINI_API_KEY` | `AIza...` | SIM (rollback) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | **SIM** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | **SIM** |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | SIM (server-only) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | do Upstash | **SIM** (sem isso rate limit é no-op) |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | do Sentry | SIM |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | do PostHog | opcional |
| `NEXT_PUBLIC_APP_VERSION` | `1.0.0-henrique` | opcional (tag Sentry) |
| `SENTRY_AUTH_TOKEN` | token CI | opcional (source-maps) |

Escopo: **prod + preview** em todas (adicionar `dev` nas `NEXT_PUBLIC_SUPABASE_*`).

---

## 4. OpenAI Dashboard — opt-out de treino

Crítico pra Consent v2. A app já envia `store: false`, mas isso é cinto + suspensório.

1. platform.openai.com → Settings → Organization → **Data Controls**
2. Desativar **"Allow use of data to improve OpenAI's models"**
3. Screenshot pro arquivo da Board

---

## 5. Rodar adversarial eval (1 vez, local)

Valida que GPT-5.1 resiste a **≥ 9/10** dos 10 vetores adversariais. Não roda em CI.

```bash
export OPENAI_API_KEY=sk-...
export RUN_ADVERSARIAL_EVAL=1
npm test -- adversarial-eval
```

Target ≥ 95%. Se passar: screenshot e avançar. Se falhar: **não faça deploy**,
abra issue e ajuste `src/lib/services/aiProvider.ts`.

---

## 6. Smoke test em staging

Deploy preview no Vercel (push de branch teste). Checklist manual:

- [ ] Criar conta teste; Consent v2 nomeia OpenAI (GPT-5.1) e Google (Gemini)
- [ ] Welcome → nome → chat em streaming funciona
- [ ] `/prova` → criar plano *"Matemática 23/04 plano cartesiano e simetrias"*
- [ ] Plano persiste com `subtopics` e `exam_format='discursive'`
- [ ] `/estudo` → flashcard `quality=5` credita XP (15 nova / 10 revista / 6 lapse)
- [ ] `/perfil` mostra rank após XP
- [ ] Upload com URL fora do Supabase → 400
- [ ] Sentry sem erros novos 10 min

Qualquer falha: **pare** e triage antes de prod.

---

## 7. Deploy pra produção

```bash
git checkout master && git pull
vercel --prod   # ou push pra master dispara build
```

Pós-deploy: `/` retorna 200, build sem warnings, Sentry release tag registrada,
PostHog captura `$pageview`.

---

## 8. Criar a conta do Henrique

**Recomendado: via UI** (reproduz UX real). URL prod → signup com email do
padrasto → consent → onboarding → adicionar child `Henrique`, idade 12, 7º ano
→ trocar pro perfil dele e entregar.

Se UI bloquear, fallback SQL:

```sql
insert into public.children (parent_user_id, name, age, grade_level)
values ('<PARENT_UUID>', 'Henrique', 12, '7º ano') returning id;

insert into public.user_profile (child_id, xp_total, current_rank)
values ('<CHILD_UUID>', 0, 'aprendiz_1');
```

---

## 9. Rollback plan

**Soft (sem deploy)**: Vercel → env var `AI_PROVIDER` de `openai` → `gemini` →
Re-deploy latest. Código do Gemini preservado em `src/lib/services/aiProvider.ts`,
testes 522/523 cobrem ambos caminhos.

**Hard (voltar versão)**: Vercel → Deployments → anterior → **Promote to Production**.

**DB**: migrations são forward-only. Reverter = migration compensatória
(`007_revert_xxx.sql`). **Não** edite 003-006 existentes.

---

## 10. Monitoramento (1ª semana 21-28/04)

**Sentry**: alert `level:error` em `/api/chat`, `/api/study/*`, `/api/gamification/*`. Revisão diária (10 min).

**PostHog** — metas da semana:

| Evento | Meta |
|---|---|
| `ai_request` | ≥ 5/dia nos dias úteis |
| `session_start` | ≥ 3/semana |
| `flashcard_review` | ≥ 10/semana |
| `plan_created` | ≥ 1 antes de cada prova |
| `achievement_unlocked` | ≥ 3 na 1ª semana |

**Custos OpenAI**: target piloto ≤ $2/dia. Budget alert em $10/dia.
**Supabase**: DB < 10% plano free, Storage < 100 MB, sem denies RLS inesperados.

---

## Troubleshooting rápido

| Sintoma | Causa | Ação |
|---|---|---|
| Chat 500 | `OPENAI_API_KEY` inválida | Verificar env var |
| Plano não cria | OpenAI sem crédito / rate limit | Dashboard OpenAI → billing |
| XP não credita | Migration 005 faltando | Rerodar SQL §2 |
| Flashcard novo não aparece | Migration 006 faltando (`due_at` NULL) | Idem |
| Upload foto 400 | URL fora do Supabase host | Verificar `NEXT_PUBLIC_SUPABASE_URL` |

Detalhes técnicos em [`deploy-runbook.md`](./deploy-runbook.md) §8 e Troubleshooting.
