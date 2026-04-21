# Deploy Runbook — Mamãe Me Ajuda

Single source of truth for shipping changes to production. Organized by phase;
check off each item before moving on.

## 1. Pre-deploy checks (local)

- [ ] `npm test` — 100% green, no skips other than the known `0.skip.ts` case.
- [ ] `npm run build` — clean build, no TypeScript errors, no ESLint errors.
- [ ] `npm run lint` — clean (should already be part of build).
- [ ] `git status` — no uncommitted migrations, fixtures, or secrets.
- [ ] Verify no `console.log`, `debugger`, or TODO/FIXME leaks in the diff.

## 2. Environment variables

### Required (production)

| Variable | Purpose | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Consumed at module-load time by `src/lib/schemas/study.ts` (storage URL validator). Must be set before build. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | |
| `OPENAI_API_KEY` | GPT-5.1 + TTS | |
| `GEMINI_API_KEY` | Fallback model | |
| `UPSTASH_REDIS_REST_URL` | Rate limiting | Missing URL = limiters silently disabled; never deploy to prod without this. |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting | |
| `SENTRY_DSN` | Server-side error tracking | |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser error tracking | |

### Optional

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_POSTHOG_KEY` | Analytics (leave blank to disable) |
| `NEXT_PUBLIC_POSTHOG_HOST` | Self-hosted PostHog override |
| `NEXT_PUBLIC_APP_VERSION` | Release tag for Sentry |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | CI source-map upload |

Validate at startup via `src/lib/supabase/server.ts` and `src/middleware.ts`.

## 3. Supabase migrations

Apply in order. Each is idempotent (safe to re-run), but order matters for
foreign-key references.

| File | Purpose | Gotchas |
|------|---------|---------|
| `001_initial_schema.sql` | users, children, conversations, messages, triggers | Baseline. |
| `002_consent_records.sql` | LGPD Art. 14 consent ledger | Includes RLS. |
| `003_study_and_gamification.sql` | study_plans, study_topics, flashcards, study_sessions, user_profile, xp_events, achievements_catalog, user_achievements, quests, power_ups, user_inventory + `award_xp` RPC + seeds | Large. Creates enums — fails on duplicate type if run mid-transaction with prior attempt; wrap in `DO` blocks (already handled). |
| `004_rebrand_ranks.sql` | Cosmetic: rename ranks, power-ups, achievements to exploração/crafting theme | Idempotent UPDATE-by-where; no drops. |
| `005_power_up_atomic.sql` | `consume_power_up` RPC (fixes race condition in power-up use) | Required by `src/app/api/gamification/power-ups/[code]/use/route.ts`. |
| `006_sm2_due_at_default.sql` | Adds `due_at` to `flashcards.sm2_state` default + backfill | Required for `pickNextCard` to return brand-new cards. |

Apply via `supabase db push` or `psql $DATABASE_URL -f supabase/migrations/XXX.sql`.

## 4. Post-migration smoke test

Run against staging (service-role or authenticated session):

```sql
-- All tables have RLS enabled
select relname, relrowsecurity
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relkind = 'r'
 order by relname;
-- All should show relrowsecurity=t

-- sm2_state has due_at key for every flashcard
select count(*) filter (where sm2_state ? 'due_at') as has_due,
       count(*) filter (where not (sm2_state ? 'due_at')) as missing_due
  from public.flashcards;
-- missing_due should be 0 after 006

-- Seeds are present
select count(*) from public.achievements_catalog; -- >= 13
select count(*) from public.power_ups;             -- >= 4

-- award_xp RPC is grantable
select has_function_privilege('authenticated', 'public.award_xp(uuid,integer,public.xp_reason,jsonb)', 'execute');
-- expected: t

-- consume_power_up RPC is grantable
select has_function_privilege('authenticated', 'public.consume_power_up(uuid,text)', 'execute');
-- expected: t
```

## 5. Build & deploy

```
npm ci
npm run build
# deploy artifact
```

For Vercel: push to main. For self-hosted: follow your platform runbook.

## 6. Post-deploy verification

- [ ] Hit `/` → ConsentModal renders; no console errors.
- [ ] Log in → children list loads (indicates Supabase connectivity).
- [ ] Generate a flashcard → card persists with `sm2_state.due_at = 1970-01-01T00:00:00.000Z` in the DB.
- [ ] Review a flashcard with `quality=5` → card's `sm2_state.due_at` updates to a future date.
- [ ] Call `/api/account/export` authenticated → 200, `Content-Disposition: attachment`, JSON body matches schema.
- [ ] Try an invalid `exam_sample_photo_url` (e.g. https://evil.com/leak.png) on `POST /api/study/plans` → 400 with "Supabase Storage" error message.
- [ ] Sentry → no new error events in the first 10 minutes.
- [ ] Upstash → rate-limit keys are being written (check dashboard).

## 7. Rollback plan

- Vercel: promote previous deployment via dashboard.
- Database: migrations are forward-only. To roll back, write a compensating
  migration (e.g. `007_revert_xyz.sql`). Do NOT hand-edit the migrations
  folder to remove files — Supabase tracks the migration ledger.
- Secrets: if a secret was rotated as part of this deploy, keep the old one
  live for the rollback window (5 minutes) before invalidating.

## 8. Known migration hazards

- `003_study_and_gamification.sql` seeds achievements and power-ups. If you
  edit seed text inline, you must either add a new migration with an UPDATE
  or rely on `004_rebrand_ranks.sql` / future rebrand migrations. Do NOT edit
  the 003 seed block in place post-deploy — Supabase won't re-run it.
- `006_sm2_due_at_default.sql` uses `||` JSONB concat. If an existing row has
  a non-object `sm2_state` (shouldn't happen given schema default, but be
  defensive), the UPDATE will raise. Mitigation: add `and jsonb_typeof(sm2_state)='object'` to the WHERE clause if needed.

## Troubleshooting

**"photo URL must be a Supabase Storage object URL"**
The frontend uploaded to a bucket that doesn't match `NEXT_PUBLIC_SUPABASE_URL`'s
host. Confirm the env var points at the same project the client-side uploader
is hitting.

**`pickNextCard` returns null despite having cards**
Check `sm2_state->>due_at` on the rows. If NULL, migration 006 hasn't run.
Re-apply it.

**Rate limits never trigger on staging**
`UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` are unset. The
limiters silently no-op when either is missing. This is intentional for
local dev but NEVER acceptable for production or staging.
