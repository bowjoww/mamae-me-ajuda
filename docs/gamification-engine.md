# Gamification Engine — Mamãe Me Ajuda

_Status: Bloco B+D delivered · 2026-04-20_

## North Star

Every XP award in this system rewards **Socratic engagement**. Never speed.
Never raw accuracy. A correct answer gained by insisting "just give me the
answer" is worth **zero XP** on top of the `quality=5` baseline; a correct
answer gained through one guided hint is worth less than an unhinted one.

This is non-negotiable. The regression test
`gamificationService.test.ts › Socratic invariant — no speed/time rewards`
guards against anyone adding a `speed_bonus` or `time_multiplier` symbol.

## XP table (single source of truth)

| Reason (`xp_reason`) | Delta | When |
|----------------------|-------|------|
| `flashcard_no_hint` | **15** | Correct answer without asking for a hint |
| `flashcard_1_hint` | **10** | Correct after one Socratic hint |
| `flashcard_2plus_hints` | **6** | Correct after two or more hints |
| `error_read_debrief` | **3** | Got it wrong, but read the debrief |
| `simulado_completed` | **50 + 0..50** | `50 + round(accuracy * 50)` |
| `focus_session` | **20** | Session lasted 15+ minutes |
| `daily_complete` | **30** | Daily quest finished (per-quest override possible) |
| `weekly_complete` | **120** | Weekly quest finished |
| `achievement_unlock` | varies | Per-achievement `xp_reward` |

XP is written via the `award_xp` Postgres function, which writes an
`xp_events` ledger row and bumps `user_profile.total_xp` in the same
transaction. Level is derived monotonically via `levelFromXp` (triangular
curve, never decreases).

## Ranks

Seven ranks, each with divisions III → II → I:

```
Recruta → Operador → Analista → Tático → Estrategista → Mentor → Arquimestre
```

Each rank spans 1200 MMR. Divisions are 400 MMR wide. `Recruta III` starts
at MMR 0; `Arquimestre I` caps at the top.

`computeRankFromMmr(mmr)` is a pure function with exhaustive tests.

## MMR formula

```
mmr = round(
  0.40 * accuracyLast30
+ 0.25 * socraticEngagement
+ 0.20 * min(consistencyDays, 7) / 7
+ 0.15 * averageDifficulty
) * 10000
```

All inputs are clamped to `[0, 1]` before weighting. `socraticEngagement`
is defined as `1 - (hints_used_total / max(hints_available_total, 1))` per
session, aggregated as a mean. **Difficulty is the only raw-performance
signal**, and it carries the smallest weight (15%).

## Achievements DSL

Rules live in `achievements_catalog.trigger_rule` as jsonb. The runtime
evaluator `evaluateRule(rule, stats)` supports:

| `type` | Required fields | Notes |
|--------|-----------------|-------|
| `xp_event_count` | `reason_in[]`, `count` | Sum of matching events |
| `flashcard_streak_no_hint` | `count` | Consecutive no-hint correct |
| `session_duration_minutes` | `min` | Any session crosses threshold |
| `study_plans_count` | `count` | Lifetime plan count |
| `distinct_topics_reviewed` | `count` | Unique topics touched |
| `study_time_window` | `start_hour`, `end_hour` | Hour-of-day match |
| `card_retry_streak` | `min_retries` | Persistence rewarded |
| `streak_returned` | `after_days` | Returned after a break |
| `simulado_comeback` | `min_accuracy` | Comeback after prior errors |

Unknown rule types return `false` silently, so new rule shapes can be
seeded without a code deploy (they stay dormant until the evaluator ships
support).

## Quest rotation

Daily quests are generated deterministically from `(child_id, YYYY-MM-DD)`
via `dailyQuestSeed + mulberry32` + Fisher-Yates shuffle. Consequences:

- The same child sees the same 3 quests on the same day, no matter how
  many times they refresh.
- A refresh attempt cannot reroll to an easier quest.
- Different children get different quests on the same day.

Weekly quest pool stays in `WEEKLY_QUEST_POOL`. Campaign missions are
attached to a `study_plan` and unlock as the exam date approaches.

## Power-ups

| Code | Rarity | Effect |
|------|--------|--------|
| `dica_extra` | common | Unlocks one extra Socratic hint |
| `revisao_relampago` | uncommon | Generates 3 review cards of last topic |
| `insight` | uncommon | Adds a cross-subject analogy |
| `segunda_chance` | rare | Retry a missed card without breaking streak |

`rollPowerUpDrop()`:

1. 60% of the time, no drop (`rng() > 0.4`).
2. On drop, weighted pick by rarity — `common: 0.6`, `uncommon: 0.3`, `rare: 0.1`.
3. Caller decides when to roll — typically on quest completion.

## Schema diagram

```
auth.users ── parent_id ──┬── children ──┬── user_profile (1:1)
                          │              ├── study_plans
                          │              │     └── study_topics
                          │              │           └── flashcards
                          │              ├── study_sessions
                          │              ├── xp_events (ledger)
                          │              ├── user_achievements ─ achievements_catalog
                          │              ├── quests ─ (optional) study_plans (campaign)
                          │              └── user_inventory ─ power_ups
                          │
                          └── conversations ── messages
```

RLS enforces `auth.uid() = parent_id` on every new table. `parent_id` is
denormalised on child rows so policies stay copy-paste-deterministic.

## Extensibility

- **New XP reason**: add to the `xp_reason` enum (migration), update
  `XP_TABLE`, add a `classify*` helper.
- **New rank**: update `RANKS` and `RANK_SPAN`. `computeRankFromMmr` adjusts
  automatically.
- **New achievement**: insert a row in `achievements_catalog`. If the rule
  needs a new `type`, extend `evaluateRule`.
- **New quest kind**: add to `DAILY_QUEST_POOL` or `WEEKLY_QUEST_POOL`. The
  `kind` identifier is consumed by the progress tracker (see each `objective`
  row in `quests.objectives`).
