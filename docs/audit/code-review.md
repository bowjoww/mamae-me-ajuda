# Code Review — `feat/modo-prova-estudo-henrique` (HEAD~15..HEAD)

**Reviewer:** Senior Code Reviewer persona (single-perspective audit)
**Scope:** ~1,800 lines across 22 TS/TSX files. Hotfix-heavy series fixing real bugs Henrique hit in production.
**Verdict:** REQUEST CHANGES — 2 CRITICAL, 5 HIGH, 6 MEDIUM.

---

## Executive Summary

The series is mostly defensive plumbing (map server snake_case → client camelCase, harden against undefined fields, add empty-state fallbacks, lazy-bootstrap flashcards). Most changes are pragmatic and well-commented — the post-incident docstrings in `gamificationClient.ts`, `gamificationMappers.ts`, and `FlashcardDuel.tsx` are exemplary; future engineers will know *why* each guard exists.

However, three structural issues stack risk before commercial launch:

1. **Unauthenticated `/api/chat` is the only entrypoint with no auth gate** (deliberate per L198-202) yet routes the full OpenAI/Gemini cost surface. Henrique's IP-based rate limit is 10 req/min — a single scanner can burn $0.50–$2 per minute against a free-tier API key with zero accountability.
2. **`pickNextCard` query has no `parent_id` filter** — relies entirely on RLS for ownership. If RLS is ever misconfigured on `flashcards` (or a future migration touches the policy), any authenticated parent could read another parent's children's cards.
3. **Failing test in `hud.test.tsx` line 181** — `onGrade` signature changed from `(grade)` to `(grade, hintsUsed)`; the existing assertion `toHaveBeenCalledWith("acertei")` will fail on next CI run.

Two `MEDIUM`s are about commercial readiness (mock-data flag handling on server-side rendering, `Math.max(0, …)` swallowing past-due dates).

| Severity | Count |
|---|---|
| CRITICAL | 2 |
| HIGH | 5 |
| MEDIUM | 6 |

---

## CRITICAL — Must fix before shipping

### C1. `pickNextCard` lacks explicit `parent_id` filter — defense-in-depth gap
**File:** `src/lib/services/flashcardService.ts:223-261`

Both queries filter only by `child_id`, with the plan ownership check happening upstream in the route handler. If a route ever calls `pickNextCard` without first doing the `children.eq("parent_id", user.id)` ownership round-trip (or a future endpoint is added that skips it), the service trusts the caller blindly. RLS is the only line of defense.

```typescript
// Current — only child-scoped
let query = supabase
  .from("flashcards")
  .select("*, study_topics!inner(plan_id)")
  .eq("child_id", params.childId)
  ...
```

**Fix:** Take `parentId` as a required parameter and add `.eq("parent_id", params.parentId)`. Belt-and-suspenders: the same `flashcards.parent_id` column already exists (it's set during insert at `flashcardService.ts:152`) so the filter has zero cost and removes a class of accidental disclosure if RLS drifts.

The /api/study/flashcards/next route at L21-29 already does the children ownership check, but `pickNextCard` is also called from `flashcardSession.ts` and other surfaces — verify all callers thread `parentId` through.

### C2. Failing test will break CI immediately
**File:** `src/app/components/hud/__tests__/hud.test.tsx:181`

```typescript
fireEvent.click(screen.getByRole("button", { name: "Acertei" }));
expect(onGrade).toHaveBeenCalledWith("acertei");   // ❌ now called with ("acertei", 0)
```

`FlashcardDuel.tsx:109` now calls `onGrade(grade, hintsShown)`. The test will fail on the next CI run. Same test file at line 173 also uses `disabled={!revealed}` semantics that still pass, but the assertion at line 181 is broken.

**Fix:** Update to `toHaveBeenCalledWith("acertei", 0)`. While fixing this, add a separate test that calls "Pedir dica" first and asserts `onGrade("acertei", 1)` — the new behaviour deserves coverage since XP table differentiates self-solve from hint-assisted (15 vs 10 XP per `gamificationClient.ts:636-641`).

---

## HIGH — Should fix before commercial launch

### H1. `/api/chat` is unauthenticated and routes paid LLM calls
**File:** `src/app/api/chat/route.ts:183-220`

Only protection is the IP-based `chatRatelimit` (10 req/min). Comment at L198-202 explicitly says "v1.1 restores auth here once OAuth is live", but this is shipping commercially. A bot using ~7 distinct IPs (cheap rotating residential proxy) gets ~70 GPT-5.1 calls/min sustained, indefinitely. At commercial launch with publicized URL, this is the highest cost-risk surface in the codebase.

**Fix options (ranked):**
1. Wrap the route in `requireUser()` once consent flow is live. Anonymous users get a polite 401.
2. If anonymous chat is truly needed pre-OAuth, add a Turnstile/hCaptcha challenge for non-authenticated calls only.
3. Per-session token budget on the client (cookie-stored), enforced server-side via Redis: 5,000 input tokens / hour for anon, no cap for auth. The Upstash Redis is already in place.

The CISO-style comments elsewhere in the codebase mean this gap will read as oversight, not policy, at audit time.

### H2. `/api/chat` provider+rate-limit checks run on EVERY request, even cached
**File:** `src/app/api/chat/route.ts:187-219`

The order is: rate-limit → provider readiness check → body parse → Zod → moderation → call. Provider readiness (`GEMINI_API_KEY`/`OPENAI_API_KEY` presence) is a constant at module load; checking it per-request is wasted work and burns rate-limit quota on misconfigured deploys (every 429 still counts against limit window because limit ran first).

**Fix:** Move the env-presence check to module scope. Return a no-op handler that always responds 500 if the key is missing, so the route logs "key missing" exactly once at boot, not 60×/min when a scanner pokes it.

### H3. `mma.activePlanId` localStorage key is duplicated across files
**Files:**
- `src/app/prova/page.tsx:359` (canonical `ACTIVE_PLAN_STORAGE_KEY`)
- `src/lib/api/gamificationClient.ts:387, 479` (duplicate constant, also `"mma.activePlanId"` string-literal at 387)
- `src/app/components/hud/FlashcardDuel.tsx:11` (different key, `mma.flashcardOnboarded`)
- `src/app/page.tsx:53` (`mma.pendingChatSeed`, hardcoded string)

The `mma.` namespace pattern is being adopted, but every consumer hardcodes its own copy. The risk: a typo (`mma.activePlanID`, `mma.active-plan-id`) silently desyncs and the bug is invisible until the user reports "my plan vanished".

**Fix:** Extract `src/lib/storageKeys.ts`:
```typescript
export const STORAGE_KEYS = {
  primaryChildId: "mma.primaryChildId",
  activePlanId: "mma.activePlanId",
  studentName: "mma.studentName",
  pendingChatSeed: "mma.pendingChatSeed",
  flashcardOnboarded: "mma.flashcardOnboarded",
  introSeen: "mma.introSeen",
} as const;
```
Import everywhere. Five-minute change, kills an entire failure class.

### H4. `fetchNextFlashcards` retry path on bootstrap failure burns LLM tokens silently
**File:** `src/lib/api/gamificationClient.ts:536-598`

If `/bootstrap` returns 5xx (GPT-5.1 timeout, OpenAI 503, etc.), the code Sentry-captures but does not bail — it falls through to `/next`. If `/next` also fails (likely on a fresh plan with no cards) it returns `[]`. Cost-wise this is fine *now* but on commercial scale: imagine 1,000 students hit "Começar coleta" during a Sunday-night study rush; if bootstrap is rate-limited by OpenAI for 30 seconds, each retry costs `count: 5` cards' worth of tokens AND a /next query. The fallback is correct UX but expensive at scale.

**Fix:** When bootstrap returns 429 specifically (vs 500), short-circuit `fetchNextFlashcards` and let the UI render "tutora ocupada, tenta em 30s" with a retry. Add a small exponential backoff on bootstrap failures (e.g., skip bootstrap retry for 60s after a 429 via in-memory flag).

### H5. `flashcards/bootstrap/route.ts` does N+1 query to find the empty topic
**File:** `src/app/api/study/flashcards/bootstrap/route.ts:69-92`

```typescript
for (const topic of topics) {
  const { count } = await supabase
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .eq("topic_id", topic.id);
  ...
}
```

For a plan with 5 topics, this issues 5 sequential round-trips to Supabase. Each is ~50-150ms; total ~500-750ms on a happy path before the LLM call even starts. Henrique's perceived latency on the "Começar coleta" tap will be the LLM (5-15s) + this overhead. Multiply N by 3-7 for AV2 plans.

**Fix:** Single GROUP BY:
```typescript
const { data: counts } = await supabase
  .from("flashcards")
  .select("topic_id, count:id.count()")
  .in("topic_id", topics.map(t => t.id));
```
Or RPC: `SELECT id, title FROM study_topics WHERE plan_id=$1 AND NOT EXISTS (SELECT 1 FROM flashcards WHERE topic_id=study_topics.id) ORDER BY "order" LIMIT 1` — one query, all the work.

---

## MEDIUM — Tech debt to track

### M1. `MOCK_ON_ERROR` includes `typeof window === "undefined"` (SSR), accidentally serves mock data on server
**File:** `src/lib/api/gamificationClient.ts:60`

```typescript
const MOCK_ON_ERROR =
  USE_MOCK || process.env.NODE_ENV === "test" || typeof window === "undefined";
```

The "fake Henrique data leaking into prod" bug that this file was rewritten to prevent (see L13-21 docstring) actually re-introduces the same risk during SSR. Server-rendered routes from /perfil, /estudo, /prova that crash will fall back to `mockProfile` / `mockQuests`. The 'fix' has the same shape as the bug it fixed.

Today this is masked because all three pages are `"use client"` — but the moment one is converted to RSC, the bug returns.

**Fix:** Remove the `typeof window === "undefined"` branch from `MOCK_ON_ERROR`. Server-side errors should propagate, not silently mock. Tests already have the `NODE_ENV === "test"` branch.

### M2. `daysUntil()` clamps past dates to 0 — silently hides "prova já passou"
**File:** `src/app/prova/page.tsx:26-30`

```typescript
return Math.max(0, Math.ceil(...));
```

If exam date is yesterday, UI reads "T−0 dias" forever. Henrique's brain will conclude "ainda dá tempo" indefinitely. The student needs to either *delete the plan* or see "Prova foi há 3 dias — quer arquivar?". Right now they get a stale forever-zero.

**Fix:** Return negative numbers, render "Prova foi {n} dia(s) atrás — arquivar?" branch in the header.

### M3. `gamificationMappers.ts` rank → division derivation is wrong on division boundaries
**File:** `src/lib/api/gamificationMappers.ts:117-128`

```typescript
const XP_PER_TIER = 600;
const currentXp = totalXp % XP_PER_TIER;
const xpForNext = XP_PER_TIER;
```

This assumes every rank takes 600 XP. The game-design doc and `mockProfile` itself use varying `xpForNext` per subject (1000, 1200, 800…). When the server's rank/division flips at the real boundary (which uses MMR weights, not flat 600), the UI's `currentXp` will be inconsistent with `tier.division`. A user landing at exactly 1800 XP would see "Batedor III, 0/600" but the server already has them at "Batedor II". UI says "you're about to rank up" when they already did.

**Fix:** Either:
1. Have the server return `currentXp` and `xpForNext` directly (preferred — single source of truth), or
2. Import the same XP table from `gamificationService.ts` so client and server compute identically.

### M4. `aiTutor.ts` retry-on-fallback loses streaming tokens on the failed first attempt
**File:** `src/lib/services/aiTutor.ts:184-205`

For streaming calls, `callWithRetry` is skipped (correct, per comment), but the model-fallback loop in `createWithFallback` still tries primary→fallback. If primary streams 50 tokens then errors, those 50 tokens are dropped silently and the fallback model starts from scratch. The user sees 50 tokens of GPT-5.1 output disappear and a different response begin. Worse: telemetry records `fallbackUsed: true` but does not record that tokens were paid for the failed primary attempt.

**Fix:** For streaming, don't run the fallback model at all once the stream has started emitting deltas — pass the error to the client immediately. The fallback should only fire if primary errors *before* the first delta event.

### M5. `FlashcardDuel.normalizeDebrief` regex may corrupt legitimate prose
**File:** `src/app/components/hud/FlashcardDuel.tsx:21-28`

```typescript
return raw
  .replace(/([^\n])\s+(\d{1,2}\.\s)/g, "$1\n\n$2")
  .trim();
```

Pattern matches `"... 3.0 cm ..."` as a list marker. Also matches `"... 1. Pedro ..."` where "1." is a real numeric reference. Currently this only runs on flashcard debrief text which is GPT-formatted, but the function is exported pattern-wise (any text passing through). Worth a comment narrowing the contract, or a smarter heuristic (e.g., require following `\d+\.` to be at start of a sentence-like phrase).

**Fix:** Tighten the regex: only insert breaks where the digit is followed by a capital letter or `**` markdown — i.e., looks like a list item, not a measurement. Or add a unit-test set covering numeric-prose edge cases.

### M6. `useStudentName` hits Supabase on every hot-reload mount even when localStorage is full
**File:** `src/lib/hooks/useStudentName.ts:39-86`

The Supabase round-trip is guarded by `initial.trim().length > 0` check at L49 — fast path works. But the slow-path `createSupabaseBrowserClient()` is re-instantiated every effect mount. On a hot reload with a missing name, you get a fresh client each time. Not a correctness bug, but means the auth call is not deduplicated across remounts.

**Fix:** Memoize the client at module scope (most patterns in this codebase already do).

---

## Architectural Observations

### Strong patterns worth replicating
1. **Defensive field access in `FlashcardDuel` (L71-77)** — `card?.front ?? ""` everywhere with explicit narration of *why* in the comment. This is exactly the pattern that should propagate to other render-time consumers of server data.
2. **Typed `GamificationError` class with `status` and `endpoint`** — gives downstream handlers something structured to switch on without parsing message strings.
3. **The post-incident comments in `gamificationClient.ts:13-21` and `gamificationMappers.ts:99-112`** — these read like a postmortem inline. Future engineers will not re-introduce the bugs.
4. **`store: false as const` on every OpenAI call in `aiTutor.ts`** — disabling training storage every call is correct paranoia for an EdTech serving minors.

### Cross-cutting concerns flagged

**State management:** localStorage keys are spreading. Three competing patterns: (a) module-level constants (`gamificationClient.ts`), (b) component-level constants (`FlashcardDuel`), (c) inline string literals (`page.tsx:53`, `page.tsx:159`). See H3.

**Error handling:** Most routes catch and return a generic 500 with Portuguese error. Acceptable. But `pickNextCard`, `persistGeneratedCards`, `reviewCard` swallow errors into `{ error: string }` returns instead of throwing — the API routes then check `outcome.error` and return 500. This works, but it's two error-handling philosophies in the same module. Consider standardizing on thrown exceptions (typed via class) at service boundary; routes catch once at the top.

**Types:** `as unknown as { ... }` casts in `pickNextCard` callsite and `flashcards/next/route.ts:44-67` are doing heavy lifting because the Supabase typed client returns rows with no foreign-key relations expanded. Worth investing in `Database` generated types via `supabase gen types typescript` to remove most casts. Currently `DBClient` is `SupabaseClient<any>` (flashcardService L18, studyPlanService L15) — RLS catches the issues but at compile-time this trades safety for delivery speed.

**LGPD/secret hygiene:** `gamificationFixtures.ts` carries `Henrique` as a literal name in the mock — fine for dev but ensure `NEXT_PUBLIC_USE_MOCK_GAMIFICATION` is not set in any preview/staging environment. The fixture also has a real-looking unlocked achievement at `2026-04-08T19:12:00-03:00`. If this ever leaks into a real account preview screen (cf. M1), it's misleading.

---

## What's Done Well

- The `bb8c5b2` commit message is honest: "three real-world bugs Henrique hit on first day of use" — and the fixes are all surgical, well-commented hotfixes rather than rewrites. This is the right ship velocity.
- `mapServerProfile` deliberately refuses to bleed `fallback` data into the returned shape (L99-112 comment). The bug it fixes — fake Henrique XP leaking into real perfis — is exactly the kind of thing that erodes trust in EdTech, and the comment ensures it won't regress.
- The `MAX_HISTORY_MESSAGES = 10` cap in `/api/chat` (L18, L240) bounds the prompt size — important for cost and for the moderation latency budget.
- `moderation.ts` keyword normalization (NFD strip, regex word-boundary) is sensible. The `OPENAI_MODERATION_TIMEOUT_MS = 450` budget is well-chosen: low enough that a moderation outage doesn't cascade into a chat outage, high enough to clear the median p95 of `omni-moderation-latest`.
- `daysUntil` aside, the `examFormat: "discursive"` plumbing from `/prova` → plan metadata → flashcard generator → tutor prompt is consistent end-to-end. The Colégio Impacto AV2 default is correctly anchored in `bootstrap/route.ts:108-111`.
- `xpToast` self-dismissing animation in `/estudo` (L171-188) is a small touch that closes a real UX gap. Toast cleanup uses `setTimeout` but the component is short-lived enough that the leak is bounded.

---

## Verification Story

- **Tests reviewed:** `hud.test.tsx` (C2 above identifies a broken assertion). Also reviewed: `moderation.test.ts` exists at `src/lib/moderation.test.ts` but not in this diff — assumed passing. No new tests added for `FlashcardDuel` hint-chain behaviour, `gamificationClient.fetchNextFlashcards` bootstrap-then-next fallback, `gamificationMappers.mapServerReviewOutcome` `xp_awarded`→`xpAwarded` mapping, or the `daysUntil` clamp. These are all hotfixed paths that would benefit from a regression test before commercial launch.
- **Build verified:** Not run (review-only persona).
- **Security checked:** Yes — flagged H1 (`/api/chat` unauthenticated cost surface), C1 (`pickNextCard` missing `parent_id` filter), and noted that the separate security-auditor agent should look at OAuth state-of-the-world before launch since H1's "v1.1 restores auth" comment suggests this gap is intentional and timeboxed.

---

## Recommendation

**Do not merge to `master` as-is.** Land C2 (test fix) and C1 (`parent_id` filter on `pickNextCard`) in this branch — they're 30-line changes. H1 (chat auth) can be a follow-up PR but must land before any commercial announcement. H2-H5 and Ms are good as tracked tech debt.

The pragmatic shipping order:
1. Fix C1 + C2 in this branch → re-run review → merge.
2. New branch: H1 OAuth gate or Turnstile.
3. New branch: H3 (`storageKeys.ts` extraction) — tiny, high-leverage.
4. Backlog: H4, H5, M1-M6.

Branch is otherwise close to ready. The hotfix series shows good engineering hygiene — real bugs caught in the wild, surgical fixes, commented for future readers. Just don't ship the two critical issues.
