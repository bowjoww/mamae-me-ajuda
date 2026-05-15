# Performance Audit — Mamãe Me Ajuda

**Date**: 2026-05-15
**Auditor**: Performance Benchmarker (static analysis)
**Scope**: Next.js 16.1.7 + React 19.2.3 + Turbopack EdTech web app on Vercel
**Target user**: 7º-ano student on mid-range Android phone over Brazilian 4G (≈10 Mbps down, 80-150 ms RTT, throttled CPU)
**Methodology**: Source-level inspection of `next.config.ts`, `package.json`, routes, components, API handlers, middleware. Dynamic measurement (Lighthouse, WebPageTest, real RUM) NOT executed — flagged in §6.

---

## 1. Executive Summary

**Predicted Core Web Vitals grade on cold 4G load (393 × 851 emulated Moto G Power):**

| Metric | Likely landing-route value | Target | Verdict |
|--------|----------------------------|--------|---------|
| LCP    | 2.6 – 3.4 s | < 2.5 s | **At risk** — narrowly fails |
| INP    | 120 – 220 ms (chat stream, Markdown re-render) | < 200 ms | **At risk during streaming** |
| CLS    | < 0.05 (no dynamic ads, font-display swap, fixed viewport) | < 0.1 | **Pass** |
| FCP    | 1.6 – 2.2 s | < 1.5 s | **Marginal fail** |
| TBT    | 250 – 400 ms (Sentry init + react-markdown parse on first message) | < 200 ms | **Fail** |

**Top three architectural bottlenecks (ranked):**

1. **Sentry on every route, client-included.** `withSentryConfig` wraps the entire app — the browser SDK is ≈70 KB gzipped and runs on every page including unauthenticated `/`. No `next.config.ts` opt-outs for client tunneling on public routes.
2. **`react-markdown` + `remark-gfm` ships into every chat-touching client bundle.** Combined ≈45 KB gzipped, parsed on every SSE token append. Used on `/` (chat) and inside `FlashcardDuel` (`/estudo`).
3. **Every page is `"use client"`.** All 7 routes (`/`, `/estudo`, `/prova`, `/perfil`, `/privacidade`, `/offline`, root) are client components. There is no Server Component shell, so React Server Components zero-JS islands are off the table. The full client-runtime + hydration ships for every navigation.

**Top three runtime concerns:**

1. **`/api/study/flashcards/bootstrap` has a real N+1.** For each topic in the plan, it issues a separate `flashcards count` query in a `for...of` loop (`route.ts:83-92`). A 6-topic AV2 plan = 7 round-trips before generation even starts. Adds 300-600 ms over Brazilian network → Supabase US East round-trips.
2. **Chat history persistence is serial after a stream completes.** `persistMessages` runs three sequential Supabase calls (`auth.getUser` → conversation lookup → insert + update) inside the SSE `done` handler, blocking the connection close (`route.ts:139-177`). Lengthens the user's perceived "tutor finished" moment by ≈400 ms on every reply.
3. **MessageList re-renders the entire transcript on every SSE delta.** Although scroll-to-bottom is debounced (good), every keystroke-equivalent token triggers `setMessages` → ReactMarkdown reparses the full accumulated string. On a 600-word answer this is ~40 reparses of growing input.

**Estimated win from top 5 fixes (cumulative): LCP −1.0 s, TBT −180 ms, JS payload on `/` −145 KB gzipped.**

---

## 2. Bundle Audit

### 2.1 Dependency weight (estimated gzipped, from `package.json` lines 16-32)

| Package | Est. client bundle | Server-only? | Notes |
|---------|--------------------|--------------|-------|
| `@google/generative-ai` ^0.24.1 | 0 KB client | Yes — only in `/api/chat/route.ts` | Good. Verify with bundle analyzer. |
| `openai` ^6.34.0 | 0 KB client | Yes — `/api/chat`, `/api/study/*` services | Good. ≈120 KB if it ever leaked. |
| `@supabase/supabase-js` ^2.103.0 | ≈40 KB | Mostly server, but `@supabase/ssr` is imported in `middleware.ts` and likely browser client | **Verify** — `supabase-js` is one of the heaviest deps. Tree-shake check needed. |
| `@supabase/ssr` ^0.10.2 | ≈8 KB | Server-side helper | Fine. |
| `@sentry/nextjs` ^10.48.0 | ≈70 KB gzipped browser SDK | **No** — auto-included via `withSentryConfig` | **Top offender.** |
| `posthog-js` ^1.366.1 | ≈56 KB gzipped (lazy-loaded) | Browser, dynamic + `requestIdleCallback` | Well-isolated — `PostHogClientLoader.tsx` defers it past TTI. Good engineering. |
| `react-markdown` ^10.1.0 | ≈28 KB gzipped | Browser, in `ChatMessage.tsx` + `FlashcardDuel.tsx` | Eager. Used on `/` and `/estudo`. |
| `remark-gfm` ^4.0.1 | ≈17 KB gzipped | Browser, same files | Eager. Loads tables/strikethrough/autolink that the kid-friendly tutor will rarely emit. |
| `@upstash/redis` + `@upstash/ratelimit` | 0 KB client | Server only — used in `/api/chat`, `/api/study/*` | Good. |
| `@serwist/next` + `serwist` ^9.5.7 | ≈4 KB in `/sw.js`, 0 in app bundle | Service worker generated at build | Fine — but verify `/sw.js` is the only ingress point. |
| `zod` ^4.3.6 | ≈12 KB (likely server-only) | Used in API schemas. Verify no client validation drift. | Fine if it stays server. |
| `next/font` (Geist + Instrument Serif + JetBrains Mono) | Self-hosted woff2 + `font-display: swap` | N/A — 3 family preloads | **Good.** No external Google Fonts request, all variable-CSS-property based. |

### 2.2 Route-by-route estimate

> Numbers below are **inferences** from imports + dependency weights. Run `next build` + `@next/bundle-analyzer` (or `ANALYZE=true next build` after wiring it) to confirm.

| Route | Likely route JS (gzipped) | Likely first-load JS | Notes |
|-------|---------------------------|----------------------|-------|
| `/` (chat — landing) | 60-80 KB | **220-260 KB** | React + Next runtime (~110 KB) + Sentry (~70 KB) + react-markdown + remark-gfm (~45 KB) + Supabase browser (~40 KB on first auth call) + chat hooks/components. **This is the biggest concern — it's the landing surface.** |
| `/estudo` | 50-70 KB | 200-230 KB | Adds FlashcardDuel (with react-markdown) + StatusBar + QuestCard |
| `/prova` | 30-45 KB | 175-200 KB | Empty-state form + MissionCard; no markdown render |
| `/perfil` | 35-50 KB | 180-205 KB | HeatmapByMatter + AchievementShard (SVG-heavy, but inline) |
| `/privacidade` | 8-15 KB | 145-165 KB | Mostly static text — should be a Server Component |
| `/offline` | 5-10 KB | 140-160 KB | Same — Server Component candidate |

**Shared base (Next runtime + React + Sentry) is approximately 180 KB gzipped, before route code.** This dominates every route's TTI.

### 2.3 Biggest offenders, ranked

1. **`@sentry/nextjs` auto-injected browser SDK (~70 KB gzipped)** — `next.config.ts:45` wraps `nextConfig` with `withSentryConfig` and there is no `tunnelRoute` exception for unauthenticated routes. The Sentry SDK initializes before user interaction, and currently runs even on `/privacidade` (a static legal page) and `/offline` (offline fallback — defeating the purpose).
2. **`react-markdown` + `remark-gfm` shipped eagerly (~45 KB gzipped)** — `ChatMessage.tsx:4-5` imports both at module top-level. The kid-friendly tutor never emits tables (Brazilian 7º-ano math doesn't need GFM tables) or footnotes. `remark-gfm` alone is ≈17 KB to support features the product doesn't use.
3. **`"use client"` on every page** — even `/privacidade` (legal copy) and `/offline` (offline fallback) are client components, costing full hydration JS. Server Components could ship 0 JS for these.
4. **No `next/dynamic` for chat surface markdown** — markdown rendering only fires after the first SSE response arrives (≈3-8 s after page load on cold path). It could be code-split behind `next/dynamic` with `ssr: false` and still hydrate before the first token arrives.
5. **No build-time `optimizePackageImports`** in `next.config.ts` — Next.js 16 supports per-package tree-shake hints. With no entry, lodash-style barrel imports from `@sentry/nextjs` and `@supabase/supabase-js` may pull more than needed.

### 2.4 Image strategy

**Verdict: weak.**

- **No `next/image` usage anywhere in `src`** (`Grep next/image` returned only `middleware.ts` references for the matcher). 
- `ChatMessage.tsx:95` uses `<img>` with `// eslint-disable-next-line @next/next/no-img-element` — student-uploaded exercise photos (base64 data URLs up to 5 MB, validated in `/api/chat/route.ts:74-89`). These render at `max-h-48 w-auto` but the source is uncompressed. **A 5 MB photo paint is a noticeable LCP/INP hit on Android**. Recommend: client-side `canvas`-based downscale before render + display.
- `ImagePreviewBar.tsx:17` — same pattern for the preview thumbnail.
- `/public/screenshots/` contains PNG screenshots (`conversa.png`, `tela-inicial.png`) but they don't appear to be referenced in any page. If they back the PWA manifest splash, convert to AVIF/WebP.
- **No `width`/`height` attributes** on the chat `<img>`, which contributes to CLS the moment a student uploads a photo. The `max-h-48` partially constrains height but the browser still reflows.

### 2.5 Font strategy

**Verdict: good** (`layout.tsx:8-28`).

- All three families (`Instrument_Serif`, `Geist`, `JetBrains_Mono`) loaded via `next/font/google` → self-hosted, no external DNS hop.
- `display: "swap"` is set on all three.
- Variable CSS properties (`--font-instrument-serif`, etc.) cleanly avoid FOIT.
- **One observation**: three full font families is one above the "max two per page" web rule. `JetBrains_Mono` is only used in HUD elements (XP counters, T-N day countdowns). Verify the subset is small (`subsets: ["latin"]` is set — good). Consider whether `JetBrains_Mono` could be replaced with `font-family: ui-monospace, "SF Mono", ...` (system stack) for the tiny HUD strings — saves a font file entirely.

---

## 3. Runtime Concerns

### 3.1 Render performance

**`/` (chat) — INP risk during streaming:**

- `useChatSession.ts:112-122` `upsertAssistant` calls `setMessages(prev => ...)` on **every** SSE delta. `MessageList.tsx` then re-renders all messages, and each `ChatMessage` re-runs `<ReactMarkdown>` on its content. For a streaming reply growing token-by-token, this is O(n²) markdown parsing.
  - **Fix**: keep the streaming assistant message in a `useRef` + `useSyncExternalStore` style, OR render the in-progress message as plain text and only swap to ReactMarkdown on the final `done` event.
  - Expected INP improvement: 80-150 ms during streaming.
- **No `React.memo` on `ChatMessage`** — every prior message re-renders even though its content hasn't changed. With 10+ messages in a long Henrique session, this multiplies the cost.

**`/estudo` and `/prova` — client component overuse:**

- `EstudoPage` (`estudo/page.tsx:87`) is a 500-line client component containing the StatCell helper (lines 484-515) inside the same file. Pure presentational helpers like `StatCell`, `MasteryDot`, and the `MISSION_ICON` SVG map (`prova/page.tsx:32-69`) could live in Server Component children. Currently they all hydrate.
- **Counter-anti-pattern observation, page.tsx:36-42**: `setMessages`-in-effect to hydrate from `studentName`. The comment acknowledges the React lint rule. Pragmatically necessary, but worth a follow-up to move student name resolution into a Server Component shell that passes the name as a prop, eliminating the hydration flash mentioned at line 99-100.

**`/perfil`:**

- `HeatmapByMatter` and 6× `AchievementShard` SVG components all render client-side. The achievements list is data-driven from `fetchProfile()`, so it can't trivially be a Server Component without an async server fetch. **Could be a Server Component with `<Suspense>` + the fetched data passed as RSC props** — saves ~30 KB of hydration overhead on this route.

### 3.2 Query performance

**Confirmed N+1: `/api/study/flashcards/bootstrap` (`route.ts:69-92`):**

```typescript
const { data: topics } = await supabase.from("study_topics").select(...).eq("plan_id", ...)  // 1 query
// ...
for (const topic of topics) {
  const { count } = await supabase
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .eq("topic_id", topic.id);  // N queries
}
```

For a typical AV2 plan with 6 topics this is **7 round-trips** before any AI generation starts. Brazilian client → Supabase US East ≈ 150 ms RTT × 7 ≈ 1 s wasted serially.

**Fix** (single query): aggregate flashcards by topic_id with a `group by`, or filter `study_topics` left-joined with `flashcards` where flashcards is null:

```typescript
const { data: emptyTopics } = await supabase
  .from("study_topics")
  .select("id, title, flashcards!left(id)")
  .eq("plan_id", parsed.data.plan_id)
  .is("flashcards.id", null)
  .limit(1);
```

(Validate the syntax against Supabase's PostgREST left-join semantics — see Supabase docs §"filters on joined tables".)

**Expected savings**: 400-700 ms on first "Começar coleta" tap.

**Other API routes — clean:**

- `/api/gamification/profile/route.ts:31-42` runs three queries in `Promise.all` — correct parallelization.
- `/api/study/plans/[id]/route.ts:13-30` runs plan + topics sequentially. **Minor**: could be parallelized since the topics filter is `plan_id = :id` which doesn't depend on the plan-fetch result. Savings: ~80 ms.
- `/api/study/flashcards/next/route.ts:55-69` issues two sequential queries (next-card → enrich topic+plan). **Could be a single query** via `study_topics!inner(title, study_plans!inner(subject))` in the original select. Already partially done — but the enrichment is a separate trip, adding ≈100-150 ms per "next card" click.
- `/api/gamification/topics/route.ts:81-87` joins `study_topics` to `study_plans` via `!inner` in a single round-trip. Clean.
- `/api/gamification/quests/route.ts:39-67` is correct: one `select` for existing, one `insert` for missing day-defs, one `select` for active. The conditional insert is acceptable but races: two parallel clients on day-rollover could each insert their own batch. Add a unique constraint `(child_id, quest_type, created_at::date)` if not present.

### 3.3 Streaming — actually streaming?

**Verdict: real streaming, but persistence blocks close.**

- `api/chat/route.ts:319-397` correctly emits SSE via `ReadableStream` + `text/event-stream` with `X-Accel-Buffering: no` (defeats Vercel/proxy buffering).
- Client (`useChatSession.ts:124-171`) correctly reads via `body.getReader()` and dispatches `delta` events.
- **Issue**: inside the `done` event handler (`route.ts:339-374`), the server runs `moderateText` (sync-but-can-be-slow) AND `persistMessages` (3 serial Supabase calls) BEFORE closing the stream. The client sees `done` event delayed by 300-600 ms after the last token.
- **Fix**: call `controller.enqueue(sseEvent("done", ...))` first, then fire `persistMessages` as a non-awaited promise (or use `waitUntil` on Vercel). The output-side moderation must precede the swap-message-to-fallback path, but that swap could happen via a `controller.enqueue("blocked")` event after `done` — the client already handles `blocked`.

### 3.4 Auth check on every request

`middleware.ts:88-89` calls `supabase.auth.getUser()` on **every** request that's not `_next/static|_next/image|favicon.ico|icons|manifest.json`. That includes `/api/chat` (excluded from `PROTECTED_ROUTES` but still gets the `getUser` call to refresh the cookie).

`supabase.auth.getUser()` makes an HTTP call to Supabase Auth (≈100-200 ms) on every page navigation. **For a chat-heavy session with 20-30 in-app navigations, that's 2-6 seconds of cumulative latency.**

**Fix**: gate `getUser()` behind `pathname` checks — only call it for protected routes or on the initial document fetch. Use the lighter `supabase.auth.getSession()` (reads cookie locally, no network) for cookie refresh.

---

## 4. Network / Infrastructure

### 4.1 CSP

`middleware.ts:44-74` — currently uses `'unsafe-inline' 'unsafe-eval'` in `script-src` (regression documented at line 51-56: nonce + strict-dynamic broke static pages, fell back to inline). This is a security concern surfaced in another audit but **does have a performance side-effect**: `'unsafe-inline'` allows the Next.js bootstrap inline script to run without JIT penalties from strict-dynamic. Net-net, no perf regression today, but the v1.1 nonce migration mentioned at line 56 will need to thread CSP headers through the layout, which would force dynamic rendering for the entire root layout (kills any future static-segment caching).

### 4.2 Cache headers

**No cache headers in `next.config.ts` `securityHeaders` array.** Static pages and API responses ship with Next.js / Vercel defaults:

- API routes default to `Cache-Control: no-store, must-revalidate`.
- Static pages default to `s-maxage=31536000`.

**Missing optimizations:**

- `/api/gamification/profile`, `/api/gamification/topics`, `/api/gamification/quests` could use `Cache-Control: private, max-age=10, stale-while-revalidate=60` — these are per-user reads that change at most every few seconds. A 10s client cache cuts repeat navigation re-fetches.
- `/api/study/plans` (list) is a candidate for `private, max-age=30, stale-while-revalidate=300`.
- Service worker (`/sw.js`) — verify it caches API responses appropriately. Generated by `@serwist/next` — check `serwist.config.ts` (not read) for the runtime caching strategy.

### 4.3 Edge runtime usage

**Verdict: zero edge functions.**

- `Grep runtime` against `src/app/api` returned no hits other than a comment string.
- All API routes default to Node.js runtime. For Brazilian users, every API hit goes to whatever single Vercel region is configured (likely `gru1` São Paulo if configured, otherwise `cle1` Cleveland).
- **Edge candidates**:
  - `/api/auth/session/route.ts` — auth cookie validation, no DB writes
  - `/api/_sentry` tunnel route (Sentry config line 55) — pure proxy
  - `/api/tts/route.ts` — likely a thin proxy; verify
  - Middleware itself already runs on Vercel Edge by default in Next 16
- **Not edge candidates**: `/api/chat` (uses streaming + Node `ReadableStream`, OpenAI SDK has Node deps), study/flashcards/* (Supabase client uses Node net). Keep these on Node runtime in `gru1`.

### 4.4 Service worker

- `src/app/components/ServiceWorkerRegistration.tsx:6-15` — registers `/sw.js` with `scope: '/'`. Fires on every mount of every page (lives in `RootLayout`). Should be wrapped in `if (process.env.NODE_ENV === 'production')` to avoid dev-time SW caching headaches.
- Serwist-generated SW likely precaches `_next/static/*` — verify it isn't precaching too aggressively (precaching the full route manifest could blow past Cache Storage quota on Android).

---

## 5. Top 5 Wins, Ranked by ROI

### 1. Defer Sentry browser SDK to first-error or first-interaction (HIGH impact, MEDIUM effort)

**Cost**: 0.5 day of work.
**Win**: ≈55-70 KB gzipped removed from every initial page load. LCP improvement: 300-500 ms on 4G.
**How**: Replace the auto-injection from `withSentryConfig` with a manual `Sentry.init()` inside a `PostHogClientLoader`-style dynamic import. Defer behind `requestIdleCallback` like PostHog already is. For error capture before init, install a lightweight `window.onerror` queue that flushes once the SDK loads.

Reference: `src/app/providers/PostHogClientLoader.tsx` shows the exact pattern.

### 2. Code-split `react-markdown` + `remark-gfm` behind `next/dynamic` (MEDIUM impact, LOW effort)

**Cost**: 1-2 hours.
**Win**: ≈45 KB gzipped off the initial `/` and `/estudo` bundles. INP fix during streaming if combined with #3.
**How**:

```typescript
// ChatMessage.tsx, FlashcardDuel.tsx
const MarkdownView = dynamic(() => import('./MarkdownView'), { 
  ssr: false, 
  loading: () => <span>{content}</span>  // render plain text while loading
});
```

This is safe because the markdown only matters after the user sends their first message — there's ~3-8 s of latency to OpenAI before markdown is needed.

### 3. Buffer streaming tokens, render markdown only on chunks / done (HIGH impact, LOW effort)

**Cost**: 2-4 hours.
**Win**: INP −80 to −150 ms during streaming. CPU on Android Moto G-class devices drops substantially during long replies.
**How**: In `useChatSession.ts:124-171`, accumulate `accumulated` outside React state. Flush to `setMessages` at chunk boundaries OR every 50 ms via `requestAnimationFrame`. Memoize `ChatMessage` with `React.memo`. On `done`, do one final flush.

Even simpler interim: render the streaming assistant message as plain `<div>{content}</div>` while `isStreaming === true`, swap to `<ReactMarkdown>` on `done`.

### 4. Convert `/privacidade` and `/offline` to Server Components (LOW impact, LOW effort)

**Cost**: 30 minutes.
**Win**: Saves ~15-25 KB of hydration on those routes. Mostly a hygiene win — these routes ship with the full client React tree currently.
**How**: Remove `"use client"`. Move any interactive content into a child client component.

### 5. Fix bootstrap N+1 + parallelize study-plan GET (MEDIUM impact, LOW effort)

**Cost**: 1 hour.
**Win**: 400-700 ms off the "Começar coleta" first-tap path. 80 ms off `/prova` cold-load.
**How**: See §3.2 — single Supabase query with `flashcards!left(id)` + `.is('flashcards.id', null).limit(1)`. Parallelize plan + topics fetch in `[id]/route.ts:13-30`.

---

### Honorable mentions (next 5)

6. **Stop calling `supabase.auth.getUser()` on every request in middleware.** Gate by `pathname.startsWith('/api/') && PROTECTED_ROUTES.some(...)` — 100-200 ms saved per navigation.
7. **Make `persistMessages` non-blocking** after SSE `done`. 300-500 ms perceived improvement at end of every reply.
8. **Compress student-uploaded images client-side** before sending to `/api/chat`. 5 MB JPEG → 400 KB WebP via OffscreenCanvas. Reduces upload latency + Gemini/OpenAI vision input cost.
9. **Add `optimizePackageImports` to `next.config.ts`** for `@sentry/nextjs`, `@supabase/supabase-js`, `react-markdown`. Free 5-15 KB.
10. **Memoize `ChatMessage` with `React.memo` keyed by `_key`.** Prevents re-render of completed messages on every streaming delta.

---

## 6. Recommended Dynamic Measurement

These cannot be verified without runtime data. Run them in this order:

### 6.1 Lighthouse runs (highest priority)

| Route | Form factor | Network | CPU throttle | Auth state |
|-------|-------------|---------|--------------|------------|
| `/` (chat) | Mobile (393×851 — Moto G Power) | Slow 4G (1.6 Mbps, 150 ms RTT) | 4× CPU slowdown | Logged out (most common landing) |
| `/` (chat) | Same | Same | Same | Logged in with 10 messages in history |
| `/estudo` | Same | Same | Same | Logged in, plan with 6 topics, 30 cards |
| `/prova` | Same | Same | Same | Logged in, no plan yet (empty state) |
| `/perfil` | Same | Same | Same | Logged in, 5 achievements |

**Target Lighthouse scores**: Performance ≥ 80, Best Practices ≥ 95, Accessibility ≥ 95.

Capture: LCP element, TTI, TBT, FCP, Speed Index, all CWV, total JS payload, longest tasks.

### 6.2 Real User Monitoring (medium priority)

PostHog is already loaded. Enable [`captureWebVitals`](https://posthog.com/docs/libraries/js#capturing-web-vitals) in `POSTHOG_OPTIONS`. Cost: 0 KB additional (already in the lazy bundle).

Once collected for ≈100 sessions on Henrique-class devices, compare against Lighthouse synthetic predictions in §1.

### 6.3 Bundle analyzer (high priority)

```bash
ANALYZE=true npm run build
```

Wire `@next/bundle-analyzer` in `next.config.ts`:

```typescript
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
export default withBundleAnalyzer(withSentryConfig(nextConfig, {...}));
```

Confirm the §2.2 estimates. Especially verify:

- Whether `@supabase/supabase-js` is fully tree-shaken in client bundles or pulling realtime/storage modules unused by this app.
- Whether Sentry's browser SDK is correctly excluded from `/offline` and `/privacidade`.

### 6.4 Server timing instrumentation

Add Vercel's `runtime.serverTiming` or `next.experimental.timing` to expose:

- Supabase round-trip time on each API route
- OpenAI/Gemini latency (split: TTFT vs total)
- Moderation latency (input + output)

This will validate the "300-600 ms persistence blocks SSE close" claim in §3.3.

### 6.5 Throttled live network test (Brazilian 4G)

Use WebPageTest with the `Brazil - EC2 - São Paulo` location + `4G` connection profile. Capture filmstrip + waterfall for the chat send → first token roundtrip. Target TTFT (time to first SSE delta): < 2.5 s.

---

## Appendix A — Specific file references (for follow-up tickets)

| Finding | File | Line(s) |
|---------|------|---------|
| Sentry auto-injection | `C:\Projetos\mamae-me-ajuda\next.config.ts` | 45-56 |
| react-markdown eager import in chat | `C:\Projetos\mamae-me-ajuda\src\app\components\ChatMessage.tsx` | 4-5, 105-110 |
| react-markdown eager import in flashcards | `C:\Projetos\mamae-me-ajuda\src\app\components\hud\FlashcardDuel.tsx` | 5-6, 287 |
| Bootstrap N+1 | `C:\Projetos\mamae-me-ajuda\src\app\api\study\flashcards\bootstrap\route.ts` | 83-92 |
| Serial persistence blocks SSE close | `C:\Projetos\mamae-me-ajuda\src\app\api\chat\route.ts` | 139-177, 339-374 |
| MessageList re-renders on every SSE delta | `C:\Projetos\mamae-me-ajuda\src\lib\hooks\useChatSession.ts` | 112-122, 147-156 |
| Middleware `getUser()` on every request | `C:\Projetos\mamae-me-ajuda\src\middleware.ts` | 88-89 |
| Unoptimized `<img>` for student uploads | `C:\Projetos\mamae-me-ajuda\src\app\components\ChatMessage.tsx` | 94-100 |
| Unoptimized `<img>` for image preview | `C:\Projetos\mamae-me-ajuda\src\app\components\ImagePreviewBar.tsx` | 17 |
| All client components | All page.tsx files | line 1 each |
| Sequential plan + topics fetch | `C:\Projetos\mamae-me-ajuda\src\app\api\study\plans\[id]\route.ts` | 13-30 |
| Two-trip next-card enrichment | `C:\Projetos\mamae-me-ajuda\src\app\api\study\flashcards\next\route.ts` | 55-69 |
| PostHog (good reference pattern) | `C:\Projetos\mamae-me-ajuda\src\app\providers\PostHogClientLoader.tsx` | 12-15 |
| PostHog (good reference pattern) | `C:\Projetos\mamae-me-ajuda\src\app\providers\PostHogProvider.tsx` | 22-39 |

---

**Auditor's overall take**: The codebase is well-structured for a v1 — clean service-layer separation, idiomatic Supabase RLS, sensible rate-limiting, real streaming, PostHog correctly deferred. The biggest perf wins are *infrastructure* decisions (Sentry auto-injection, all-client-components) rather than code rot. The bootstrap N+1 is the only "real" bug; everything else is "could be sharper." For a 7º-ano student on a Moto G-class device + Brazilian 4G, the top 5 wins together would move the experience from "noticeably sluggish" to "snappy."
