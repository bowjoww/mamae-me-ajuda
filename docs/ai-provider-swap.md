# AI Provider Swap — Gemini → OpenAI (GPT-5.1)

_Status: Bloco A (48h architectural rollout) · 2026-04-20_

## Summary

The chat tutor moved from `gemini-2.5-flash` (via `@google/generative-ai`) to
OpenAI's `gpt-5.1` (via the official `openai` Node SDK, Responses API, SSE
streaming). Gemini stays hot as a rollback option for two sprints, gated by
the `AI_PROVIDER` environment variable.

## Decisions

| Topic | Choice | Why |
|---|---|---|
| Provider SDK | `openai@6.x` | Official, typed, streams natively |
| API surface | **Responses API** (`openai.responses.create`) | Required for GPT-5 family; supports `reasoning.effort` |
| Default model | `gpt-5.1` | Confirmed alive in the API as of 2026-04-20 despite being retired from ChatGPT on 2026-03-11. OpenAI has stated no current plan to deprecate it in the API. |
| Fallback model | `gpt-5.1-mini` | Same family, cheaper, roughly same behaviour on Socratic prompts |
| Streaming | SSE over `ReadableStream` | Token-by-token UX; lower TTFB |
| Reasoning | `effort: "medium"` default, `"high"` on `prova` mode | Balances latency vs. quality |
| Feature flag | `AI_PROVIDER=gemini\|openai` (default `gemini`) | Instant rollback without redeploy |
| DB `role` enum | Stays `"user" \| "model"` | Zero migration; never persist `"assistant"` to preserve historical rows |
| Zod schema | Accepts `"assistant"` as input alias | Forward-compat for clients that speak OpenAI-native roles |

## Model IDs — verification trail

Confirmed via:

1. [openai/openai-node README](https://github.com/openai/openai-node) (Context7 pull 2026-04-20) — `gpt-5.2` listed as current README example, `gpt-5.1` still supported.
2. [developers.openai.com/api/docs/guides/latest-model](https://developers.openai.com/api/docs/guides/latest-model) — latest flagship is `gpt-5.4` as of April 2026.
3. [OpenAI Help Center — model retirements](https://help.openai.com/en/articles/9624314-model-release-notes) — GPT-5.1 retired from ChatGPT on **2026-03-11** but **remains available in the API**; OpenAI states "no current plans to deprecate GPT-5.1, GPT-5, or GPT-4.1 in the API."

We deliberately chose **`gpt-5.1`** (not the newer `gpt-5.4`) because:

- The CEO brief specified `gpt-5.1` as the default and `gpt-5.1-mini` as fallback.
- `gpt-5.1` has a larger deployed body of Socratic prompt work at comparable enterprise tiers.
- Moving to `gpt-5.4` is trivial later: set `OPENAI_MODEL=gpt-5.4` in env and redeploy. No code change required.

Both model IDs are configurable via env:

```bash
OPENAI_MODEL=gpt-5.1           # primary
OPENAI_MODEL_FALLBACK=gpt-5.1-mini
```

## Architecture

```
+-----------------------+
| /api/chat (route.ts)  |  reads AI_PROVIDER
+-----------+-----------+
            |
    +-------+-------+
    |               |
openai=="openai"   gemini (legacy)
    |               |
    v               v
askTutor()     gemini-2.5-flash
    |
    v
buildSystemPrompt(name, mode, ctx)  <-- Socratic DNA lives here
    |
    v
responses.create({           <-- Responses API
  model: gpt-5.1,            (primary → fallback chain)
  instructions,
  input: [{role, content}],  ("model" → "assistant" conversion)
  stream: true,
  reasoning: { effort }
})
    |
    v
consumeStream() yields
  { type: "delta", text }  \
  { type: "done",  tokens } } abstracted by askTutor
    |
    v
SSE events: delta / done / blocked / error
```

## File map

| File | What changed |
|---|---|
| `src/lib/services/openaiClient.ts` | **NEW.** Singleton + `callWithRetry` (exponential backoff, 4xx non-retryable) |
| `src/lib/services/aiTutor.ts` | **NEW.** Provider-agnostic `askTutor()` + `buildResponsesInput()`; primary→fallback chain; LGPD-safe telemetry |
| `src/lib/chatUtils.ts` | `buildSystemPrompt(name)` → `buildSystemPrompt(name, mode?, ctx?)`. 100% backward compatible — single-arg call returns byte-identical legacy prompt. |
| `src/lib/supabase/types.ts` | Comment explaining why DB enum stays `"user"\|"model"` |
| `src/app/api/chat/route.ts` | Branch on `AI_PROVIDER`. New `handleOpenAIStream()` returns `Response` with `Content-Type: text/event-stream` |
| `src/app/page.tsx` | Detects `text/event-stream` response and drains SSE, updating the assistant message on every delta |
| `src/app/api/__tests__/chat.test.ts` | Added 5 tests for the OpenAI streaming path, kept all 12 Gemini tests green |
| `src/lib/services/__tests__/*.test.ts` | **NEW.** 16 tests covering client retry, fallback, streaming, prompt composition |

## Token / cost model

Primary workload (Bloco A pilot — Henrique):

```
~50 messages/day × 7 days = 350 messages/week
average input  ≈ 800 tokens (system + history + user turn)
average output ≈ 350 tokens (Socratic guided reply)
```

At `gpt-5.1` published price (retrieved 2026-04-20 via BenchLM listing):

```
input:  $1.25 / 1M tokens → 350 × 800  = 280k tokens = $0.35
output: $10.00 / 1M tokens → 350 × 350 = 122k tokens = $1.22
-----------------------------------------------------------
weekly pilot cost:                                    ≈ $1.57
monthly if fully adopted at 200 students × same rate: ≈ $63 / month
```

Reasoning tokens (`effort: "medium"`) are included in `output_tokens` per
OpenAI's billing model. If we flip mode to `"prova"` (`effort: "high"`), expect
roughly 1.5–2× output cost. Budget monitoring happens via the
`[ai_request]` Sentry/console logs — see `src/lib/services/aiTutor.ts`
→ `emitTelemetry()`.

## Rollback procedure

**Instant (no deploy):**

```bash
# Vercel env: flip AI_PROVIDER and redeploy-trigger (or use edge config).
AI_PROVIDER=gemini
```

Within one revalidation cycle the route will use `handleGemini()` which is
byte-identical to the pre-swap behaviour. Gemini code and SDK stay in the
bundle until at least the end of sprint 3 (2026-05-15).

**Partial (model downgrade):**

```bash
OPENAI_MODEL=gpt-5.1-mini
OPENAI_MODEL_FALLBACK=gpt-5.1-mini
```

## Safety & LGPD

- No message content ever reaches Sentry or PostHog — only token counts, model id, mode, and fallback flag.
- Moderation (OpenAI `omni-moderation-latest`) runs pre-input and post-output for **both** providers. The streaming path moderates on the final accumulated text just before the `done` SSE event; if flagged, the stream emits a `blocked` event with the safe fallback copy.
- The Socratic system prompt — `NUNCA dê a resposta direta` — is preserved byte-for-byte across all modes. The regression test `buildSystemPrompt › contains the absolute rule about not giving direct answers` guards this.

## Smoke-test results (2026-04-20)

- `npm run build` ✓ clean (Next.js 16.1.7, Turbopack)
- `npm run lint` ✓ 0 errors, 8 pre-existing warnings
- `npm test` ✓ **202 tests pass** (was 181). New suites:
  - `src/lib/services/__tests__/openaiClient.test.ts` — 6 tests
  - `src/lib/services/__tests__/aiTutor.test.ts` — 10 tests
  - `src/app/api/__tests__/chat.test.ts` — +5 OpenAI-path tests
- Coverage overall: **89.86%** (threshold 80%, no drop)

## Known risks

1. **`gpt-5.1` could be deprecated** in the API with 3-6 months' notice. Mitigation: `OPENAI_MODEL` is env-configurable; swapping to `gpt-5.4` is a one-line change.
2. **SSE streaming does not survive Vercel Edge function buffering** without `Cache-Control: no-transform`. We set this header explicitly; verify after first deploy.
3. **Moderation on streamed output** is post-hoc (after full accumulation). A malicious token could reach the user for 200-400 ms before the `blocked` event replaces it. Acceptable per current product posture (age 8-14 audience, narrow tutor domain), but worth revisiting if we add open-ended conversation modes.
4. **No streaming retry.** If the primary model stream fails mid-token, we surface an error event rather than silently retry, because replaying would double-deliver tokens. The non-stream path does retry with backoff.

## Next actions

- Bloco B (database layer): migrate `messages.role` only if/when we introduce a `reasoning` or `tool` role.
- Add an integration test that asserts `Cache-Control: no-transform` on SSE responses once we have a real Vercel deployment target.
- Wire `[ai_request]` telemetry into PostHog as a distinct event once the analytics wrapper exposes server-side capture (currently client-only).
- Consider `reasoning.effort: "low"` for chat after the first greeting turn — 3× faster first-token time.
