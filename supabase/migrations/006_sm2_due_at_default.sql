-- Mamãe Me Ajuda — Ensure every flashcard has a `due_at` key in sm2_state.
--
-- Problem: migration 003 created `flashcards.sm2_state` with a JSON default
-- of `{"ef":2.5,"interval":0,"repetitions":0,"quality":0}` — no `due_at`.
-- Meanwhile src/lib/services/flashcardService.ts:pickNextCard queries:
--
--   .lte("sm2_state->>due_at", now)
--
-- In Postgres JSONB, `->>` on a missing key returns NULL. `NULL <= now` is
-- also NULL, which means brand-new cards are silently dropped from the "due"
-- query. The repetitions=0 fallback catches many of these, but not all
-- (e.g. cards that got half-reviewed before due_at was backfilled, or cards
-- whose sm2_state got rewritten by a partial update).
--
-- Fix:
--   1. Bump the column default to include due_at at epoch-zero (1970) so new
--      rows ARE immediately due.
--   2. Backfill any existing row whose sm2_state is NULL or lacks due_at.
--
-- Epoch-zero rationale: any card that hasn't been reviewed yet should sort
-- to the front of the due-queue regardless of when it was generated. A
-- nonzero default (e.g. "now") creates a race where a freshly-inserted row
-- is excluded by sub-millisecond clock skew between the DB server and the
-- app server issuing the query.
--
-- Idempotent: ALTER COLUMN SET DEFAULT and the UPDATE with an existence
-- predicate are both safe to re-run.

-- 1. New default for fresh inserts.
alter table public.flashcards
  alter column sm2_state set default
    '{"ef":2.5,"interval":0,"repetitions":0,"quality":0,"due_at":"1970-01-01T00:00:00.000Z"}'::jsonb;

-- 2. Backfill rows that lack the key. `sm2_state || jsonb` shallow-merges
--    the new key into the existing object; if the key is already present
--    the merge is a no-op because `?` would have filtered it out first.
update public.flashcards
   set sm2_state = sm2_state || '{"due_at":"1970-01-01T00:00:00.000Z"}'::jsonb
 where sm2_state is null
    or not (sm2_state ? 'due_at');

-- The idx_flashcards_due index from migration 003 already covers the
-- (child_id, sm2_state->>'due_at') path, so no index change is required —
-- Postgres will pick it up on the next query.
