# Study Mode Backend — End-to-End Flow

_Status: Bloco B+D delivered · 2026-04-20_

## The two study modes

- **Modo Prova** — exam-oriented. Student uploads a reference photo, the AI
  parses intent, builds a plan, runs a Socratic simulado, then scores
  readiness.
- **Modo Estudo** — continuous. Student studies a topic, SM-2 spaced
  repetition drives the next card, engagement feeds the MMR.

## Prova flow (5 steps → API calls)

```
1. Intent parse
   POST /api/study/plans              (client provides parsed intent)
   └─ studyPlanService.createPlanFromIntent
      └─ creates study_plans row + N study_topics rows

2. Flashcard generation (per topic)
   POST /api/study/flashcards/generate  { topic_id, count }
   └─ flashcardService.generateCardsForTopic
      └─ askStructured() with json_schema: cards[] with hint_chain
         └─ persistGeneratedCards → N flashcards rows (sm2_state = initial)

3. Session start
   POST /api/study/sessions  { child_id, mode: "prova", plan_id }
   └─ studySessionService.startSession

4. Socratic loop (N cards)
   POST /api/study/flashcards/next     { child_id, mode, plan_id }
   └─ pickNextCard: due first (sm2_state->>due_at <= now), else new
   POST /api/study/flashcards/review   { card_id, quality, hints_used, read_debrief }
   └─ reviewCard: SM-2 schedule(state, quality) → persist
   └─ classifyFlashcardXp(hints_used, correct, read_debrief) → delta
   └─ awardXp (RPC) → xp_events ledger + user_profile.total_xp

5. Score + debrief
   POST /api/study/sessions/:id/end  { questions_asked, cards_reviewed,
                                       cards_correct, hints_used_total,
                                       hints_available_total }
   └─ studySessionService.endSession
      └─ socratic_engagement_score = 1 - (hints_used / hints_available)
      └─ if duration >= 15min → awardXp(focus_session: 20)
```

## Estudo flow (continuous)

```
POST /api/study/sessions   { child_id, mode: "estudo" }
POST /api/study/flashcards/next       (repeat)
POST /api/study/flashcards/review     (repeat)
POST /api/study/sessions/:id/end
```

SM-2 selects the review set. Engagement score funnels into MMR through
`recalculateMmr` (called by the MMR refresher — typically cron/hourly).

## Gamification side-effects

- `flashcards/review` writes `xp_events` and may unlock an achievement if
  the catalog rule matches.
- `sessions/:id/end` awards `focus_session` XP if duration >= 15 min.
- `quests` endpoint generates today's 3 daily quests on first access.
- `power-ups/:code/use` decrements inventory; the actual "effect" (e.g.,
  extra hint) is applied client-side based on the confirmed consumption.

## Schema diagram

```
study_plans ── study_topics ── flashcards
     │             │               │
     │             │               └─ sm2_state (jsonb: ef, interval, repetitions, due_at)
     │             │
     │             └─ mastery_score (derived)
     │
     └─ metadata.exam_sample_photo_url  (optional reference photo)

study_sessions ── mastery_delta (jsonb per topic)
         └─ socratic_engagement_score (informs MMR)
```

## Security invariants

1. **`store: false` on every OpenAI call.** See `aiTutor.ts` `buildParams`.
2. **RLS on every new table.** Policy is `auth.uid() = parent_id`. The
   `award_xp` RPC checks `parent_id = auth.uid()` inside the function body.
3. **Zod `.strict()` on every handler.** Unknown fields yield 400.
4. **Rate limits** (CISO-defined):
   - plans: 5/min
   - sessions: 30/min
   - flashcards/generate: 10/min
   - flashcards/next: 60/min
   - flashcards/review: 60/min
   - gamification.*: 60/min
5. **Zero content logging.** Telemetry (`[ai_request]`) logs model, mode,
   token counts, fallback flag — never prompts or completions.

## Key files

| Path | What lives here |
|------|-----------------|
| `supabase/migrations/003_study_and_gamification.sql` | Schema + RLS + seeds + `award_xp` RPC |
| `src/lib/services/spacedRepetition.ts` | Pure SM-2 implementation |
| `src/lib/services/studyPlanService.ts` | Plan/topic creation, AI intent parse |
| `src/lib/services/flashcardService.ts` | Card generation, SM-2 review, next-card selection |
| `src/lib/services/studySessionService.ts` | Session start/end + engagement score |
| `src/lib/services/gamificationService.ts` | XP math, MMR, ranks, quests, achievements, drops |
| `src/lib/schemas/study.ts` | Zod schemas for every handler |
| `src/lib/apiHelpers.ts` | requireUser / enforceRateLimit / parseStrictJson |
| `src/app/api/study/**` | 7 study endpoints |
| `src/app/api/gamification/**` | 4 gamification endpoints |
