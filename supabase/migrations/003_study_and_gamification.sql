-- Mamãe Me Ajuda — Bloco B+D: Study mode + gamification engine.
-- Adds flashcards, SM-2 scheduling, study plans/sessions, and the full
-- rank/XP/quest/achievement stack wired into Supabase RLS.
--
-- IMPORTANT:
--   * Every new table is owned by a parent via parent_id (auth.users).
--   * RLS is enabled on every table. Policies are `auth.uid() = parent_id`.
--   * parent_id is denormalised on child rows so that policies stay a single
--     equality check (no cross-table joins in the RLS layer).
--   * XP rules purposely never reward speed or raw accuracy — only Socratic
--     engagement. See docs/gamification-engine.md.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.study_mode as enum ('prova', 'estudo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.study_plan_status as enum ('draft', 'active', 'completed', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.flashcard_difficulty as enum ('easy', 'medium', 'hard');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.xp_reason as enum (
    'flashcard_no_hint',
    'flashcard_1_hint',
    'flashcard_2plus_hints',
    'error_read_debrief',
    'simulado_completed',
    'focus_session',
    'achievement_unlock',
    'daily_complete',
    'weekly_complete'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.quest_type as enum ('daily', 'weekly', 'campaign_mission');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.quest_status as enum ('active', 'completed', 'expired', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.power_up_rarity as enum ('common', 'uncommon', 'rare');
exception when duplicate_object then null; end $$;

-- ─── study_plans ──────────────────────────────────────────────────────────────
create table if not exists public.study_plans (
  id                uuid primary key default uuid_generate_v4(),
  parent_id         uuid not null references auth.users(id) on delete cascade,
  child_id          uuid not null references public.children(id) on delete cascade,
  subject           text not null check (char_length(subject) between 1 and 80),
  topic             text not null check (char_length(topic) between 1 and 200),
  exam_date         date,
  status            public.study_plan_status not null default 'draft',
  metadata          jsonb not null default '{}'::jsonb,
  mastery_summary   jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_study_plans_child on public.study_plans(child_id, status);
create index if not exists idx_study_plans_parent on public.study_plans(parent_id);
create index if not exists idx_study_plans_exam on public.study_plans(exam_date) where exam_date is not null;

-- ─── study_topics ─────────────────────────────────────────────────────────────
create table if not exists public.study_topics (
  id                uuid primary key default uuid_generate_v4(),
  plan_id           uuid not null references public.study_plans(id) on delete cascade,
  parent_id         uuid not null references auth.users(id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 200),
  "order"           integer not null default 0,
  mastery_score     real not null default 0 check (mastery_score between 0 and 1),
  last_reviewed_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_study_topics_plan on public.study_topics(plan_id, "order");

-- ─── flashcards ───────────────────────────────────────────────────────────────
-- sm2_state: { ef: real, interval: int, repetitions: int, quality: int, due_at: timestamptz }
create table if not exists public.flashcards (
  id                 uuid primary key default uuid_generate_v4(),
  topic_id           uuid not null references public.study_topics(id) on delete cascade,
  parent_id          uuid not null references auth.users(id) on delete cascade,
  child_id           uuid not null references public.children(id) on delete cascade,
  question           text not null check (char_length(question) between 1 and 4000),
  hint_chain         jsonb not null default '[]'::jsonb, -- ordered array of Socratic hints
  answer_explanation text not null check (char_length(answer_explanation) between 1 and 8000),
  difficulty         public.flashcard_difficulty not null default 'medium',
  sm2_state          jsonb not null default '{"ef":2.5,"interval":0,"repetitions":0,"quality":0}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_flashcards_topic on public.flashcards(topic_id);
create index if not exists idx_flashcards_child on public.flashcards(child_id);
-- Cards due for review. The cast pulls the ISO8601 string out of jsonb.
create index if not exists idx_flashcards_due
  on public.flashcards (child_id, ((sm2_state->>'due_at')));

-- ─── study_sessions ───────────────────────────────────────────────────────────
create table if not exists public.study_sessions (
  id                         uuid primary key default uuid_generate_v4(),
  parent_id                  uuid not null references auth.users(id) on delete cascade,
  child_id                   uuid not null references public.children(id) on delete cascade,
  mode                       public.study_mode not null,
  plan_id                    uuid references public.study_plans(id) on delete set null,
  started_at                 timestamptz not null default now(),
  ended_at                   timestamptz,
  questions_asked            integer not null default 0 check (questions_asked >= 0),
  cards_reviewed             integer not null default 0 check (cards_reviewed >= 0),
  cards_correct              integer not null default 0 check (cards_correct >= 0),
  socratic_engagement_score  real not null default 0 check (socratic_engagement_score between 0 and 1),
  mastery_delta              jsonb not null default '{}'::jsonb,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists idx_study_sessions_child on public.study_sessions(child_id, started_at desc);

-- ─── user_profile (gamification state) ────────────────────────────────────────
create table if not exists public.user_profile (
  id              uuid primary key default uuid_generate_v4(),
  child_id        uuid not null unique references public.children(id) on delete cascade,
  parent_id       uuid not null references auth.users(id) on delete cascade,
  display_title   text,
  current_rank    text not null default 'Recruta',
  rank_division   text not null default 'III' check (rank_division in ('I','II','III')),
  total_xp        bigint not null default 0 check (total_xp >= 0),
  rank_mmr        real not null default 0 check (rank_mmr between 0 and 10000),
  active_title    text,
  profile_frame   text,
  streak_days     integer not null default 0 check (streak_days >= 0),
  last_active_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_user_profile_child on public.user_profile(child_id);

-- ─── xp_events (immutable ledger) ─────────────────────────────────────────────
create table if not exists public.xp_events (
  id          uuid primary key default uuid_generate_v4(),
  parent_id   uuid not null references auth.users(id) on delete cascade,
  child_id    uuid not null references public.children(id) on delete cascade,
  delta       integer not null,
  reason      public.xp_reason not null,
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_xp_events_child_created on public.xp_events(child_id, created_at desc);
create index if not exists idx_xp_events_reason on public.xp_events(reason);

-- ─── achievements_catalog (seeded) ────────────────────────────────────────────
create table if not exists public.achievements_catalog (
  code          text primary key,
  name          text not null,
  description   text not null,
  xp_reward     integer not null default 0 check (xp_reward >= 0),
  is_hidden     boolean not null default false,
  trigger_rule  jsonb not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.user_achievements (
  id                 uuid primary key default uuid_generate_v4(),
  parent_id          uuid not null references auth.users(id) on delete cascade,
  child_id           uuid not null references public.children(id) on delete cascade,
  achievement_code   text not null references public.achievements_catalog(code) on delete cascade,
  unlocked_at        timestamptz not null default now(),
  unique (child_id, achievement_code)
);

create index if not exists idx_user_achievements_child on public.user_achievements(child_id);

-- ─── quests ───────────────────────────────────────────────────────────────────
-- objectives: [{ kind: string, target: number, progress: number }]
create table if not exists public.quests (
  id            uuid primary key default uuid_generate_v4(),
  parent_id     uuid not null references auth.users(id) on delete cascade,
  child_id      uuid not null references public.children(id) on delete cascade,
  quest_type    public.quest_type not null,
  campaign_id   uuid references public.study_plans(id) on delete set null,
  title         text not null,
  description   text not null default '',
  objectives    jsonb not null default '[]'::jsonb,
  xp_reward     integer not null default 0 check (xp_reward >= 0),
  expires_at    timestamptz,
  status        public.quest_status not null default 'active',
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_quests_child_status on public.quests(child_id, status, expires_at);

-- ─── power-ups catalog + inventory ────────────────────────────────────────────
create table if not exists public.power_ups (
  code        text primary key,
  name        text not null,
  description text not null,
  rarity      public.power_up_rarity not null
);

create table if not exists public.user_inventory (
  id             uuid primary key default uuid_generate_v4(),
  parent_id      uuid not null references auth.users(id) on delete cascade,
  child_id       uuid not null references public.children(id) on delete cascade,
  power_up_code  text not null references public.power_ups(code) on delete cascade,
  qty            integer not null default 0 check (qty >= 0),
  acquired_at    timestamptz not null default now(),
  unique (child_id, power_up_code)
);

create index if not exists idx_user_inventory_child on public.user_inventory(child_id);

-- ─── updated_at triggers ──────────────────────────────────────────────────────
create trigger study_plans_updated_at        before update on public.study_plans        for each row execute function public.set_updated_at();
create trigger study_topics_updated_at       before update on public.study_topics       for each row execute function public.set_updated_at();
create trigger flashcards_updated_at         before update on public.flashcards         for each row execute function public.set_updated_at();
create trigger study_sessions_updated_at     before update on public.study_sessions     for each row execute function public.set_updated_at();
create trigger user_profile_updated_at       before update on public.user_profile       for each row execute function public.set_updated_at();
create trigger quests_updated_at             before update on public.quests             for each row execute function public.set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table public.study_plans           enable row level security;
alter table public.study_topics          enable row level security;
alter table public.flashcards            enable row level security;
alter table public.study_sessions        enable row level security;
alter table public.user_profile          enable row level security;
alter table public.xp_events             enable row level security;
alter table public.user_achievements     enable row level security;
alter table public.quests                enable row level security;
alter table public.user_inventory        enable row level security;
alter table public.achievements_catalog  enable row level security;
alter table public.power_ups             enable row level security;

-- Owner-only policies. Keep these copy-paste-deterministic.
create policy "study_plans_all_own"       on public.study_plans       for all using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
create policy "study_topics_all_own"      on public.study_topics      for all using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
create policy "flashcards_all_own"        on public.flashcards        for all using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
create policy "study_sessions_all_own"    on public.study_sessions    for all using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
create policy "user_profile_all_own"      on public.user_profile      for all using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
create policy "user_achievements_all_own" on public.user_achievements for all using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
create policy "quests_all_own"            on public.quests            for all using (auth.uid() = parent_id) with check (auth.uid() = parent_id);
create policy "user_inventory_all_own"    on public.user_inventory    for all using (auth.uid() = parent_id) with check (auth.uid() = parent_id);

-- xp_events: write via app code (authenticated), read by parent only. No updates.
create policy "xp_events_select_own" on public.xp_events for select using (auth.uid() = parent_id);
create policy "xp_events_insert_own" on public.xp_events for insert with check (auth.uid() = parent_id);

-- Catalogs: everyone authenticated can read; writes gated to service role.
create policy "achievements_catalog_select_all" on public.achievements_catalog for select using (auth.role() = 'authenticated');
create policy "power_ups_select_all"            on public.power_ups            for select using (auth.role() = 'authenticated');

-- ─── RPC: transactional XP award ──────────────────────────────────────────────
-- Writes an xp_events row AND bumps user_profile.total_xp atomically.
-- Called via supabase.rpc("award_xp", {...}).
create or replace function public.award_xp(
  p_child_id uuid,
  p_delta    integer,
  p_reason   public.xp_reason,
  p_context  jsonb default '{}'::jsonb
) returns bigint
language plpgsql security definer as $$
declare
  v_parent uuid;
  v_new_total bigint;
begin
  select parent_id into v_parent from public.children where id = p_child_id;
  if v_parent is null then
    raise exception 'Unknown child_id';
  end if;
  if v_parent <> auth.uid() then
    raise exception 'Forbidden';
  end if;

  insert into public.xp_events(parent_id, child_id, delta, reason, context)
  values (v_parent, p_child_id, p_delta, p_reason, coalesce(p_context, '{}'::jsonb));

  insert into public.user_profile(child_id, parent_id, total_xp)
  values (p_child_id, v_parent, greatest(0, p_delta))
  on conflict (child_id) do update
    set total_xp = greatest(0, public.user_profile.total_xp + p_delta),
        last_active_at = now(),
        updated_at = now()
  returning total_xp into v_new_total;

  return v_new_total;
end;
$$;

grant execute on function public.award_xp(uuid, integer, public.xp_reason, jsonb) to authenticated;

-- ─── Seeds: achievements ──────────────────────────────────────────────────────
insert into public.achievements_catalog (code, name, description, xp_reward, is_hidden, trigger_rule) values
  ('primeiro_sangue',     'Primeiro Sangue',           'Complete seu primeiro flashcard.',                            25, false, '{"type":"xp_event_count","reason_in":["flashcard_no_hint","flashcard_1_hint","flashcard_2plus_hints"],"count":1}'),
  ('socratico',           'Socrático',                 'Acerte 5 cards usando pelo menos uma dica guiada.',           60, false, '{"type":"xp_event_count","reason_in":["flashcard_1_hint","flashcard_2plus_hints"],"count":5}'),
  ('clutch',              'Clutch',                    'Termine um simulado com nota acima da média depois de errar.', 80, false, '{"type":"simulado_comeback","min_accuracy":0.6}'),
  ('speedrun_inverso',    'Speedrun Inverso',          'Fique 30+ minutos em uma única sessão focada.',               90, false, '{"type":"session_duration_minutes","min":30}'),
  ('comeback',            'Comeback',                  'Volte a estudar após 3 dias parado.',                         40, false, '{"type":"streak_returned","after_days":3}'),
  ('ace',                 'Ace',                       'Complete 10 flashcards sem usar dica.',                      120, false, '{"type":"xp_event_count","reason_in":["flashcard_no_hint"],"count":10}'),
  ('estrategista',        'Estrategista',              'Crie 3 planos de estudo.',                                    50, false, '{"type":"study_plans_count","count":3}'),
  ('mapeamento',          'Mapeamento',                'Revise 25 cards em tópicos distintos.',                       70, false, '{"type":"distinct_topics_reviewed","count":25}'),
  ('no_hint_run',         'No-Hint Run',               'Sequência de 20 acertos sem dica.',                          200, false, '{"type":"flashcard_streak_no_hint","count":20}'),
  ('debrief',             'Debrief',                   'Leia o debrief após errar 5 vezes.',                          30, false, '{"type":"xp_event_count","reason_in":["error_read_debrief"],"count":5}'),
  ('noturno',             'Noturno',                   'Estude entre 21h e 23h.',                                    35, true,  '{"type":"study_time_window","start_hour":21,"end_hour":23}'),
  ('madrugada_produtiva', 'Madrugada Produtiva',       'Estude entre 00h e 05h.',                                    50, true,  '{"type":"study_time_window","start_hour":0,"end_hour":5}'),
  ('teimoso',             'Teimoso',                   'Tente o mesmo card 3+ vezes até acertar.',                    40, true,  '{"type":"card_retry_streak","min_retries":3}')
on conflict (code) do nothing;

-- ─── Seeds: power-ups ─────────────────────────────────────────────────────────
insert into public.power_ups (code, name, description, rarity) values
  ('dica_extra',         'Dica Extra',         'Desbloqueia uma dica socrática adicional no próximo card.', 'common'),
  ('revisao_relampago',  'Revisão Relâmpago',  'Gera 3 cards de revisão rápida do último tópico.',           'uncommon'),
  ('insight',            'Insight',            'Pede um paralelo explicativo com outra matéria.',            'uncommon'),
  ('segunda_chance',     'Segunda Chance',     'Repete um card errado sem penalidade de streak.',            'rare')
on conflict (code) do nothing;
