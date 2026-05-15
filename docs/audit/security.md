# Security Audit — Mamãe Me Ajuda

**Audit date:** 2026-05-15
**Auditor:** Security Engineer (codified review — does not replace a third-party pentest)
**Scope:** Next.js 16 / React 19 / Supabase EdTech app targeted at a 12-year-old Brazilian user. Source tree at `C:\Projetos\mamae-me-ajuda`, branch `feat/modo-prova-estudo-henrique` at `dfe84ee`.
**Out of scope:** Sentry vendor security, Supabase platform hardening, Vercel runtime CVEs, OpenAI/Gemini upstream policy.
**Companion document:** `docs/audit/legal-compliance.md` — items 4.1, 4.4, 4.5 overlap.

---

## 1. Executive summary

| Severity | Count |
|----------|-------|
| CRITICAL | 4 |
| HIGH     | 7 |
| MEDIUM   | 8 |
| LOW      | 6 |

**Go/no-go for paid commercialization:** **NO-GO until C1–C4 and H1–H3 are remediated.** The application's overall security posture is **above average for a pre-launch EdTech** — RLS coverage is solid, Zod validation is universal, Sentry/PostHog are LGPD-aligned, the OpenAI client sets `store: false`, and Upstash rate-limiting is wired into every expensive endpoint. However, the deliberately-unauthenticated `/api/chat` and `/api/tts` endpoints expose a cost-abuse vector (C1–C2) that a single rotating-IP bot can exploit to burn $1k+/day of OpenAI budget. CSP is currently `'unsafe-inline' 'unsafe-eval'` (H1), which collapses the XSS defense-in-depth posture for a kids' product where the threat model includes child-targeted phishing. The Upstash rate-limiter trusts the first `X-Forwarded-For` IP without validating Vercel's hop (M2), letting an attacker spoof IPs trivially. None of these are exploited today, but **a paid public launch would expose them within hours**.

The codebase shows clear evidence of security-aware engineering: every API route uses Zod with `.strict()`; RLS policies are uniform `auth.uid() = parent_id`; the OpenAI `exam_sample_photo_url` is locked to the Supabase Storage origin (SSRF defense); JWT validation flows through `supabase.auth.getUser()` not the client-trusted `getSession()`; prompt injection has explicit countermeasures in `chatUtils.ts:49–67`. The remaining gaps are concentrated in (a) the unauthenticated chat surface, (b) CSP / browser-side defense, and (c) IP trust assumptions in the rate-limiter.

---

## 2. CRITICAL findings

### C1 — Unauthenticated `/api/chat` enables six-figure-monthly cost abuse from rotating IPs

**File:** `src/app/api/chat/route.ts:183–215`, `src/middleware.ts:12–17`
**Severity:** CRITICAL (financial loss + service availability)
**CVSS 3.1:** 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H)

**Evidence.** The middleware list at `middleware.ts:12–17` deliberately excludes `/api/chat` and `/api/tts`:
```ts
const PROTECTED_ROUTES = [
  "/api/children",
  "/api/conversations",
  "/api/study",
  "/api/gamification",
];
```
And the chat route doubles down at `chat/route.ts:198–202`: "Cost-abuse defense lives in the Upstash rate-limiter above, not in an auth gate". The rate-limiter (`ratelimit.ts:24–28`) is **10 requests / minute / IP**, keyed by `getClientIp(req)` which trusts the first comma-split value of `X-Forwarded-For`.

**Attack scenario.** A bot using 100 rotating residential IPs (≈$20/day on commodity proxy networks) bypasses the per-IP limit and issues 1,000 requests/minute = 1.44M requests/day. Each request runs GPT-5.5 (`gpt-5.1` per `aiTutor.ts:62`) at `reasoning: { effort: "medium" }`. At a conservative 2000 input + 800 output tokens × $5/$15 per million tokens (gpt-5.5 pricing), each request costs ~$0.022. Daily burn: **~$32,000**. Plus the OpenAI moderation pre-check (`moderation.ts:80–130`) at $0.50/M tokens adds 5% on top. Plus the optional `wantsStream: true` path keeps connections open longer, which raises Vercel function-duration charges.

The Sentry quota also blows up — every `[chat_error]` log line gets captured (line 448–451).

**Compounding factors.**
- The cost-blowup is silent until the OpenAI bill arrives 24h later or the OpenAI account hits a hard quota wall and the legitimate users see 429s.
- The `validateImageDataUrl` check (line 74–89) only enforces 5 MB of base64. An attacker can attach **any** valid 5 MB image — that's ~13k vision tokens, ~10x the textual cost. Combined image+text request is ~$0.20 each. Same 1.44M/day = **$288k/day worst case**.
- No global request budget (e.g., Upstash `chatRatelimit` against a single `prefix:rl:chat:global` key with a 100k/day cap).

**Fix recipe.**
1. **Add a global daily ceiling alongside the per-IP limit.** Two lines in `ratelimit.ts`:
```ts
// In ratelimit.ts, after chatRatelimit is created:
export const chatGlobalDailyRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(50_000, "1 d"),  // ≈ $1k/day cap at avg request cost
  prefix: "rl:chat:global",
});
```
And in `chat/route.ts:185–196`, fire both:
```ts
if (chatRatelimit && chatGlobalDailyRatelimit) {
  const ip = getClientIp(req);
  const [{ success: perIp }, { success: globalOk }] = await Promise.all([
    chatRatelimit.limit(ip),
    chatGlobalDailyRatelimit.limit("singleton"),  // shared key — bounds total spend
  ]);
  if (!perIp || !globalOk) {
    return NextResponse.json(
      { error: "Limite diário atingido. Tente novamente amanhã." },
      { status: 429 }
    );
  }
}
```
2. **Require auth on `/api/chat` ASAP.** Move it into `PROTECTED_ROUTES` once Google OAuth ships (v1.1 per the comment at line 11). Until then, ship the global cap as the hard ceiling.
3. **Drop the per-IP allowance for image requests.** A 5 MB image is 10x the cost of a text request. Add a separate `chatImageRatelimit` at 3/min/IP:
```ts
if (lastMessage.image && chatImageRatelimit) {
  const { success } = await chatImageRatelimit.limit(getClientIp(req));
  if (!success) return NextResponse.json({ error: "Limite de imagens" }, { status: 429 });
}
```
4. **Add billing alerts on both OpenAI and Vercel** before launch (out of scope for code but blocks go-live).

---

### C2 — `/api/tts` unauthenticated, no global cap, exposes OpenAI TTS budget to bots

**File:** `src/app/api/tts/route.ts:9–32`
**Severity:** CRITICAL (financial loss)
**CVSS 3.1:** 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H)

**Evidence.** Same architectural pattern as C1: no auth gate (per the explicit comment at line 23–25), only the per-IP `ttsRatelimit` of 20 req/min (`ratelimit.ts:30–34`). The route accepts up to **4096 characters** of input (`tts/route.ts:6`) and ships them to OpenAI TTS at $15 per million characters (tts-1) = $0.06 per request. With 100 rotating IPs × 2000 requests/minute (still under the per-IP limit) = 2.88M req/day × $0.06 = **$172k/day**.

The response is cacheable for 1 hour (`Cache-Control: public, max-age=3600`, line 80), which limits damage if the same text is replayed — but an attacker who randomizes the input text bypasses cache entirely.

**Attack scenario.** Identical to C1 with cheaper unit cost but the same blast radius. There is also no length-based smoothing: a 4096-char input takes longer to generate, raising Vercel function-duration charges proportionally.

**Fix recipe.** Apply the same two-line global daily cap pattern from C1, plus reduce the per-request character cap to ~800 chars (which covers any single chat response after markdown stripping). Long debriefs can be chunked client-side and re-requested.
```ts
// In ratelimit.ts:
export const ttsGlobalDailyRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(20_000, "1 d"),
  prefix: "rl:tts:global",
});

// In tts/route.ts: after the per-IP check, also gate on ttsGlobalDailyRatelimit.limit("singleton").
// And tighten the schema:
const ttsSchema = z.object({ text: z.string().min(1).max(800) });
```

---

### C3 — Image-upload size enforcement runs **after** the request body is fully buffered in memory

**File:** `src/app/api/chat/route.ts:221, 74–89`
**Severity:** CRITICAL (denial of service via memory exhaustion)
**CVSS 3.1:** 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H)

**Evidence.** At line 221 the route calls `req.json()` which buffers the **entire** request body into memory before any validation runs. The Zod schema at lines 52–67 accepts `image: z.string().optional()` with **no max length** — there is no `.max(N)` on the image string field, no `.max(N)` on `content`. The 5 MB cap at line 84–87 runs against the already-decoded base64 string.

An attacker can send a request with a 100 MB base64 string in `messages[0].image`. The behavior:
1. Vercel Node runtime ingests up to its body-size limit (`bodySize: '4.5mb'` is the default for the Node runtime, but Edge runtime defaults higher and a `runtime: 'nodejs'` route with a custom config can lift it). The current route has no `export const config = { api: { bodyParser: ... } }` block, so it falls back to Next 16 defaults — which are **disabled-bodyparser, fetch-style** on App Router. The body limit is effectively the platform's, not a route-local cap.
2. `req.json()` parses the whole 100 MB JSON in one Node call. V8 string overhead can balloon the resident size 2–3x.
3. Each concurrent malicious request holds ~300 MB on the function instance. Vercel's largest serverless function has 3 GB of RAM. **10 concurrent attackers = OOM and a 502 cascade.**

The fact that the IP rate-limiter runs *before* `req.json()` doesn't help: the per-IP cap is 10/min, but 10 concurrent in-flight requests is already enough to exhaust memory.

**Fix recipe.**
1. **Cap the entire request body up front.** Read the `Content-Length` header before calling `.json()`:
```ts
// At top of POST handler, before any I/O:
const contentLength = Number(req.headers.get("content-length") ?? 0);
const MAX_REQUEST_BYTES = 7 * 1024 * 1024; // 5MB image + history overhead
if (contentLength > MAX_REQUEST_BYTES) {
  return NextResponse.json(
    { error: "Requisição muito grande." },
    { status: 413 }
  );
}
```
**Note:** `Content-Length` can be omitted with chunked encoding. Combine with a streaming size check:
```ts
const reader = req.body?.getReader();
let total = 0;
const chunks: Uint8Array[] = [];
if (!reader) return NextResponse.json({ error: "Sem corpo." }, { status: 400 });
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  total += value.byteLength;
  if (total > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Muito grande." }, { status: 413 });
  }
  chunks.push(value);
}
const body = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c)))));
```
2. **Tighten the Zod schema** so even a well-formed request can't carry a giant string:
```ts
const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "model"]),
    content: z.string().max(4000),               // ← was unbounded
    image: z.string().max(7_500_000).optional(), // ≈ 5MB base64 + overhead, was unbounded
  })).min(1).max(10),
  // ...
});
```
3. **Validate MIME via magic bytes**, not the data-URL prefix string. An attacker can claim `data:image/png;base64,...` while the bytes decode to something else. Decode the first 12 bytes and check the signature (PNG = `89 50 4E 47`, JPEG = `FF D8 FF`, WebP = `52 49 46 46 ... 57 45 42 50`, GIF = `47 49 46 38`).

---

### C4 — Production `console.error` in chat handler leaks 500 chars of error message + 5-line stack to logs (PII vector)

**File:** `src/app/api/chat/route.ts:432–451`
**Severity:** CRITICAL (LGPD Art. 6 violation if PII leaks; observable today in Vercel runtime logs)
**CVSS 3.1:** 4.3 (AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N)

**Evidence.** The catch block deliberately writes `error.message.slice(0, 500)` and `error.stack.split("\n").slice(0, 5).join("\n")` to `console.error` for "diagnose without Sentry" (line 433–447). This was added in commit `8a4ede2` / `bb8c5b2` to fix the silent-failure bug. The intent is sound (observability), but the **error message frequently contains the prompt content**:
- OpenAI SDK errors include the offending input in `err.message` (e.g., "Bad request: content too long: 'user said XYZ...'").
- Zod parse errors include the failing field value.
- Supabase RLS denial messages include the table name + row data fragment.

The student's name `studentName` from `chatSchema` lands inside the user message string — when an OpenAI moderation error fires on a name like "Henrique Federici", it ends up in plaintext in Vercel runtime logs.

Vercel runtime logs are **retained for 30 days minimum** in the Pro plan and accessible to anyone with team Read role.

**Attack scenario.** Internal (or a future contractor) with Vercel team Read access reads the runtime logs and harvests PII. Or a misconfigured log-forwarding integration exports them to a third party not under a BAA / DPA.

**Compounding factor.** Sentry's `beforeSend` at `sentry.server.config.ts:56–70` scrubs by *field name* (`PII_FIELDS` set) and by *regex* on string values. But `console.error` bypasses Sentry entirely — the Vercel-level log pipe captures the raw output.

**Fix recipe.**
1. Hash/redact the message before logging. Add a tiny helper in `src/lib/logging.ts`:
```ts
const PII_REGEXES = [
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  /\d{3}\.?\d{3}\.?\d{3}[\-]?\d{2}/g, // CPF
];
export function scrubLog(s: string): string {
  let out = s;
  for (const re of PII_REGEXES) out = out.replace(re, "[REDACTED]");
  return out.slice(0, 200); // 500 → 200 chars
}
```
And in `chat/route.ts:437–447`:
```ts
console.error("[chat_error]", {
  name,
  message: scrubLog(message),
  stack: undefined,            // drop stack from the runtime log — Sentry still has it
  request_id: req.headers.get("x-request-id"),
});
```
2. Stop logging stacks to stdout. Sentry already captures them at line 448–451; the stdout copy adds nothing the Sentry forensic trail doesn't already have.

---

## 3. HIGH findings

### H1 — CSP uses `'unsafe-inline' 'unsafe-eval'` on `script-src` (XSS defense-in-depth collapsed)

**File:** `src/middleware.ts:44–74`
**Severity:** HIGH (XSS amplifier)
**Evidence:** Line 58 — `"script-src 'self' 'unsafe-inline' 'unsafe-eval'"`. The comment at lines 49–57 acknowledges this is a regression from a previous nonce-based CSP. The rationale (static-rendering incompatibility with nonces) is real but the fix path (v1.1 migrate to dynamic rendering) is unscoped.

**Attack scenario.** Any reflected-XSS or stored-XSS that lands in a React-rendered text node escapes via the existing React defenses. But the moment we render any AI-generated Markdown that contains HTML (via something like `react-markdown` with `rehype-raw` — check if that ships), the inline-script bypass becomes exploitable. Likewise, any `dangerouslySetInnerHTML` call. The Brazilian kids-app threat model includes social-engineering attacks where parents are tricked into pasting links into a parent-facing form.

**Fix recipe.** Two paths, ordered by ease.

*Path A — Quick win (1-2 days):* Force the root layout to dynamic rendering, ship a per-request nonce.
```ts
// src/app/layout.tsx
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? '';
  return (
    <html>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: '/* inline bootstrap */' }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```
And in `middleware.ts:44–74`:
```ts
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",  // Tailwind needs inline styles — acceptable
    // ...rest unchanged
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const response = NextResponse.next({
    request: { headers: new Headers({ ...Object.fromEntries(request.headers), 'x-nonce': nonce }) },
  });
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  // ... rest unchanged
}
```

*Path B — If nonce-on-static is blocked by Vercel cache:* Keep `unsafe-inline` for `style-src`, drop `unsafe-eval` from `script-src` (no eval is needed in the production bundle — confirm with `grep -r "eval" src/` after a build), and accept the `unsafe-inline` script gap as a known risk recorded in the security register.

---

### H2 — Rate-limiter trusts `X-Forwarded-For` first hop verbatim, enabling trivial IP spoofing

**File:** `src/lib/ratelimit.ts:90–94`
**Severity:** HIGH (rate-limit bypass → amplifies C1, C2)
**Evidence:**
```ts
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "127.0.0.1";
}
```
This trusts the **first** value in `X-Forwarded-For` without validating that the upstream hop is Vercel's edge. Vercel populates `X-Forwarded-For` as `<client>, <vercel-edge-ip>` — but a malicious client can send `X-Forwarded-For: 1.2.3.4` and Vercel prepends `<client-ip>` so the header arrives as `1.2.3.4, <vercel-edge>, <real-client>`. The first split gives `1.2.3.4` — the attacker's spoofed value.

**Attack scenario.** Attacker sends 10 requests with `X-Forwarded-For: 1.1.1.1`, then 10 with `X-Forwarded-For: 1.1.1.2`, ... — bypassing the 10/min/IP cap trivially. Combined with C1, the attacker doesn't even need rotating residential IPs.

**Fix recipe.** Use `X-Real-IP` (Vercel-controlled, not client-spoofable) or trust the **last** hop in `X-Forwarded-For` after Vercel's edge:
```ts
export function getClientIp(req: Request): string {
  // Vercel sets x-real-ip server-side; clients cannot spoof it.
  // See: https://vercel.com/docs/edge-network/headers#x-real-ip
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  // Fallback for non-Vercel environments: trust only Vercel's documented edge header.
  const fwd = req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-forwarded-for");
  if (!fwd) return "127.0.0.1";
  const parts = fwd.split(",").map((s) => s.trim()).filter(Boolean);
  // Take the right-most IP that's NOT in Vercel's CIDR — for a single-proxy
  // environment, that's just parts[0]. Document the chain assumption.
  return parts[0] || "127.0.0.1";
}
```
**Note:** Vercel's `x-vercel-forwarded-for` is the authoritative header — see vercel.com/docs/edge-network/headers. Prefer it when present.

---

### H3 — `messages` table has no retention policy; full chat content + studentName lifecycle is indefinite

**File:** `supabase/migrations/001_initial_schema.sql:36–46`, `src/app/api/chat/route.ts:139–177`
**Severity:** HIGH (LGPD Art. 15 IV; PII blast radius if JWT or DB is stolen)
**Evidence.** `messages.content` is `text not null` with no retention metadata and no cron job to expire it. Every chat turn is persisted indefinitely (route line 159–172). The `persistMessages` function gates by `conversation.parent_id = auth.uid()` but doesn't TTL the row. Combined with no `DELETE /api/account`, a 5-year-old chat history is recoverable forever.

**Attack scenario.** A stolen Supabase JWT (e.g., XSS via H1, or a leaked session cookie) reads every message the parent has ever sent, including images-related references and the `studentName` baked into every chat. The blast radius is **the entire lifetime of the account**, not just the session window.

**Fix recipe.**
1. **Add a `created_at` index + retention cron.** Run nightly:
```sql
DELETE FROM messages
 WHERE created_at < now() - interval '365 days';
DELETE FROM conversations
 WHERE updated_at < now() - interval '365 days'
   AND NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = conversations.id);
```
Schedule via Supabase pg_cron or a Vercel cron route hitting a `service_role` admin endpoint.
2. **Add a self-serve "Apagar histórico" button on `/perfil`** that calls `DELETE /api/conversations` cascading to messages (the cascade already exists per schema line 38).
3. **Cite the retention period in `/privacidade`** — needed for LGPD Art. 9 transparency.

---

### H4 — JWT lifetime not pinned; default Supabase access tokens are 1h but refresh tokens are long-lived

**File:** `src/lib/supabase/server.ts:17–32`, `src/lib/supabase/middleware-client.ts:8–29`
**Severity:** HIGH (session theft window)
**Evidence.** The Supabase client uses default token TTLs: access token 1h, refresh token 60 days (Supabase default). The refresh-token cookie is set with default attributes — there's no `httpOnly: true, secure: true, sameSite: 'Lax'` override visible in the cookie setter (it relies on Supabase SSR helpers). The middleware calls `getUser()` on every request (line 88), which is correct — but the cookie hijack window is 60 days.

**Attack scenario.** XSS or man-in-the-middle on a coffee-shop wifi → refresh token stolen → 60 days of access. Combined with H3 (no retention), the attacker reads the entire chat history.

**Fix recipe.**
1. **Configure shorter token lifetimes in the Supabase dashboard:** access 30 min, refresh 7 days. Document in `docs/security/supabase-config.md`.
2. **Verify cookie attributes** by inspecting the response in a real request:
```ts
// In middleware.ts, after supabase.auth.getUser(), inspect response.cookies.getAll() — ensure each has httpOnly: true, secure: true, sameSite: 'lax'.
```
Supabase SSR sets these by default in production, but the audit should verify with curl.
3. **Add a "Sair de todos os dispositivos" action** on `/perfil` that calls `supabase.auth.signOut({ scope: 'global' })` — currently only single-session logout exists in `/api/auth/logout/route.ts`.

---

### H5 — Image MIME validation relies on the `data:image/...` prefix only; no magic-byte check

**File:** `src/app/api/chat/route.ts:74–89`
**Severity:** HIGH (content-type spoofing → potential AI prompt smuggling)
**Evidence.** Line 75: `dataUrl.match(/^data:(image\/[\w+]+);base64,(.+)$/)`. The MIME comes from the client-controlled prefix string. An attacker can claim `data:image/png;base64,<bytes-of-PDF>` and pass validation.

**Attack scenario.** Two harms:
1. **AI prompt smuggling.** The OpenAI vision endpoint may parse the file differently than expected (e.g., as a PDF with embedded text), allowing the attacker to embed instructions in non-rendered text that the model still reads.
2. **Downstream tooling drift.** If the image bytes are ever stored (today they aren't, but future feature might), a `.exe` masquerading as `.png` could be served back to the user.

**Fix recipe.** Add a magic-byte verifier:
```ts
function verifyImageMagic(base64: string, claimedMime: string): boolean {
  const head = Buffer.from(base64.slice(0, 16), "base64");
  if (claimedMime === "image/png")  return head[0] === 0x89 && head[1] === 0x50;
  if (claimedMime === "image/jpeg") return head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF;
  if (claimedMime === "image/gif")  return head.slice(0,4).toString('ascii') === 'GIF8';
  if (claimedMime === "image/webp") return head.slice(0,4).toString('ascii') === 'RIFF'
                                       && head.slice(8,12).toString('ascii') === 'WEBP';
  return false;
}
// In validateImageDataUrl after the prefix match:
if (!verifyImageMagic(base64, mimeType)) {
  return { error: "Conteúdo da imagem inválido.", status: 400 };
}
```

---

### H6 — Moderation engine fails open when OpenAI moderation is unavailable

**File:** `src/lib/moderation.ts:132–152`
**Severity:** HIGH (kid-safety regression under partial outage)
**Evidence.** Lines 146–149:
```ts
const openAIResult = await moderateWithOpenAI(text, scope);
if (!openAIResult) {
  return { blocked: false, scope };
}
```
When the OpenAI moderation API is down (timeout: 450 ms per line 6, or 5xx), `moderateWithOpenAI` returns `null` and the wrapper says "not blocked" — **the chat proceeds**. The keyword filter (lines 137–144) does catch obvious cases, but the keyword list at lines 8–25 covers only ~15 explicit Portuguese terms and misses entire categories (CSAM-grooming hints, self-harm method discussion in non-direct phrasing, etc.).

**Attack scenario.** During an OpenAI moderation outage (which happens 1–2x per quarter historically), any user — including the 12-year-old — can send and receive content that wouldn't pass the OpenAI filter. Higher risk for outbound moderation: a prompt-injected adversarial input could elicit harmful output during the outage window.

**Fix recipe.** Fail closed when the moderation service is unavailable **for input scope** (where the cost of false-positive blocking is low). Keep fail-open for output scope (where blocking breaks a legitimate response):
```ts
const openAIResult = await moderateWithOpenAI(text, scope);
if (!openAIResult) {
  if (scope === "input") {
    // Fail closed on input — re-prompt the child to ask differently.
    return {
      blocked: true,
      scope,
      engine: "openai",
      categories: ["moderation_unavailable"],
    };
  }
  // Output scope: keyword filter already ran above; let the response through.
  return { blocked: false, scope };
}
```
Also widen the keyword list to include common Portuguese CSAM-grooming and self-harm patterns — work with the kid-safety lawyer to assemble a vetted list (out of scope to enumerate here).

---

### H7 — Chat error response surfaces "429-detection by error-message substring" which can be probed

**File:** `src/app/api/chat/route.ts:457–472`
**Severity:** HIGH (information disclosure → upstream quota fingerprinting)
**Evidence.** Lines 457–463:
```ts
const isQuotaOrRate =
  lower.includes("quota") || lower.includes("rate limit") ||
  lower.includes("429") || lower.includes("resource_exhausted") ||
  lower.includes("too many requests");
```
The client can distinguish "upstream OpenAI quota hit" (429 with specific message) from "general 500" (other 500 with generic message). An attacker can use this to fingerprint when the OpenAI account is near its quota — useful for cost-amplification timing attacks.

**Attack scenario.** Attacker sends 1 chat request, sees if the kid-friendly 429 message appears. If yes, they know the budget is depleted and can ramp up attacks to push it over. If no, they wait an hour and try again.

**Fix recipe.** Return the same opaque 503 for both cases, log the detail in Sentry only:
```ts
if (isQuotaOrRate) {
  Sentry.captureMessage("upstream_quota_exhausted", { tags: { endpoint: "chat" } });
  return NextResponse.json(
    { error: "A tutora deu uma pausa. Tente daqui a um minuto." },
    { status: 503 }
  );
}
return NextResponse.json(
  { error: "A tutora deu uma pausa. Tente daqui a um minuto." },
  { status: 503 }
);
```
Same kid-friendly message, same status code — attacker can no longer distinguish.

---

## 4. MEDIUM findings

### M1 — `tts/route.ts` `console.error` logs raw OpenAI error body, which may contain the input text on certain failure modes
**File:** `src/app/api/tts/route.ts:67–73, 83–88`. The `await response.text()` at line 67 dumps the upstream body to stdout. OpenAI sometimes echoes the offending input in its error payload. Apply the same `scrubLog` helper from C4 and truncate to 200 chars.

### M2 — No CSRF token on state-changing routes
The app relies on `SameSite=Lax` cookies (Supabase default) for CSRF defense. That's correct for browser-initiated requests but doesn't cover the case where a future browser extension or a CDN-cached XSS sets up a same-site form post. For a kids' app, add an explicit CSRF token on `/api/auth/login`, `/api/account/export`, `/api/children/*` PATCH/DELETE. Use the `X-CSRF-Token` header pattern with a per-session token tied to the Supabase session.

### M3 — No body-size cap on TTS endpoint
`tts/route.ts` has the same architectural gap as C3 — no `Content-Length` pre-check. The Zod cap (4096 chars) limits text size *after* parsing, but a 100 MB request body with a 4096-char `text` field plus a giant unknown property still buffers in full because the schema isn't `.strict()`. Add `.strict()` to the Zod object and add the streaming size check.

### M4 — `consent_records_insert_open` RLS policy is wide open (`with check (true)`)
**File:** `supabase/migrations/002_consent_records.sql:24–27`. Anyone with the Supabase anon key (which ships in the bundle) can insert arbitrary `consent_records` rows. The route validates the payload via Zod, but the policy itself permits bypass via direct Supabase REST calls. Add a rate-limit on inserts via an Edge Function or move the insert to a server-only RPC.

### M5 — `gamification/quests` GET generates daily quests *during* a read
**File:** `src/app/api/gamification/quests/route.ts:39–60`. Calling this endpoint with a stale `child_id` triggers an UPSERT-style insert that costs Supabase RPC time. A noisy client polling this endpoint generates Postgres write load. Move quest generation to a cron job or a background worker; the GET handler should be read-only.

### M6 — `auth/callback/route.ts` allow-list is hardcoded and would silently redirect unknown `next` values to `/`
**File:** `src/app/auth/callback/route.ts:26–32`. `SAFE_REDIRECT_PATHS = new Set(["/", "/prova", "/estudo", "/perfil"])`. New routes added later (e.g., `/relatorio`) would silently fall back to `/` after Google OAuth. The fall-back is safe (default deny), but the auditor should ensure the allow-list is kept in sync with the route map. Add a unit test that scans `src/app/**/page.tsx` and asserts every published page is in the allow-list.

### M7 — Sentry source maps are uploaded but the comment "Upload source maps only in CI/production" in `next.config.ts:50–52` doesn't prevent local source map files from being shipped in the build
**File:** `next.config.ts:48–55`. The `disable` flag covers the upload step but the local `.map` files may still ship in the Vercel artifact if a developer runs `NODE_ENV=production npm run build` locally. Confirm the prod bundle has no `.map` files in `.next/static/` by adding a CI check.

### M8 — `openaiClient` has no global concurrency limit
**File:** `src/lib/services/openaiClient.ts:28–38`. The singleton client has no `httpAgent` with `maxSockets`. Under high load, the OpenAI SDK creates one connection per concurrent call. Add `new OpenAI({ apiKey, maxConcurrentRequests: 10 })` or wrap in a p-limit semaphore. Without this, a burst of legitimate `/api/study/flashcards/generate` calls can saturate the function instance.

---

## 5. LOW findings

- **L1** — `next.config.ts:8–32` ships `X-XSS-Protection: 1; mode=block` (legacy header, harmless but cargo-culted). Modern browsers ignore it.
- **L2** — `next.config.ts` doesn't set `X-Permitted-Cross-Domain-Policies: none` (Flash legacy, low impact today).
- **L3** — `next.config.ts` doesn't set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Useful when serving payment iframes later.
- **L4** — `apiHelpers.ts:34–46` `enforceRateLimit` returns `null` when limiter is null — fine for dev, but production has no startup assertion that Upstash env vars exist. Add `if (process.env.NODE_ENV === "production" && !chatRatelimit) throw new Error(...)` in `ratelimit.ts`.
- **L5** — `chat/route.ts:62` `z.string().max(50)` for studentName — but the route then calls `sanitizeStudentName(rawName)` which strips HTML. Defense-in-depth is fine; consider strict alpha+space regex too.
- **L6** — The `gamificationService.dailyQuestSeed` (`gamificationService.ts:245–254`) uses FNV-1a hashing over `childId|YYYY-MM-DD`. Not security-sensitive, but trivially predictable. Not a bug — quest variety is the only goal.

---

## 6. Things done right (build confidence)

This codebase is **noticeably better than typical pre-launch EdTech**. Specific wins:

1. **RLS coverage is uniform and correct.** Every table with `parent_id` has policies of the form `auth.uid() = parent_id`. Cross-parent reads are impossible at the database layer even if the API layer botches a filter. `messages_select_own` (`001:96–102`) correctly joins through `conversations.parent_id` rather than denormalizing.
2. **The OpenAI client sets `store: false` everywhere.** `aiTutor.ts:157, 167, 291`. This blocks OpenAI's training-data retention — a critical CISO blocker for kids' apps.
3. **Sentry PII scrubbing is real and field-aware.** `sentry.client.config.ts:48–87` and matching server config — regex sweep + field-name allow-list. The `sendDefaultPii: false` setting cuts cookie/IP forwarding at the source.
4. **PostHog is configured with `ip: false, persistence: memory, respect_dnt: true, autocapture: false, disable_session_recording: true`** (`analytics.ts:70–79`). No silent surveillance.
5. **Prompt injection has explicit defenses in the system prompt.** `chatUtils.ts:49–67` lists 8 specific manipulation patterns and instructs the model to refuse. The Socratic contract is uniquely strict ("NUNCA dê a resposta direta").
6. **`exam_sample_photo_url` is locked to the Supabase Storage origin** (`schemas/study.ts:40–95`). Excellent SSRF defense — and the query-string stripper (`stripStorageUrlQuery`) prevents signed-URL JWTs from leaking into prompts/logs.
7. **OAuth callback validates `next` against an allow-list** (`auth/callback/route.ts:26–32`). Open-redirect impossible.
8. **Power-up consumption is atomic via a SECURITY DEFINER function** (`migrations/005_power_up_atomic.sql`). Race condition for duplicate consumption is correctly fixed.
9. **Auth endpoints have brute-force rate limiting** (`ratelimit.ts:37–41` — 5/min/IP).
10. **Account export endpoint is rate-limited at 1/hour and Content-Disposition'd with `Cache-Control: no-store`** (`account/export/route.ts:78–172`). LGPD Art. 18 done well.
11. **Zod schemas use `.strict()` on every study/gamification route** — unknown fields are rejected, not silently accepted. Documented as a CISO blocker.
12. **Test coverage is substantive** — `src/app/api/__tests__/*.test.ts` covers auth, chat, study, consent. The `adversarial-eval.test.ts` suggests adversarial testing exists.

---

## 7. Recommended immediate actions (top 5, risk × ease)

| # | Action | Severity addressed | Effort |
|---|--------|--------------------|--------|
| 1 | **Add global daily cost ceiling to `chatRatelimit` and `ttsRatelimit`** (a single `Ratelimit.fixedWindow(N, "1 d")` against `prefix:rl:chat:global` keyed by `"singleton"`). Two lines in `ratelimit.ts`, two lines in each route. | C1, C2 | **30 min** |
| 2 | **Replace `getClientIp` with `x-real-ip` / `x-vercel-forwarded-for`.** One function in `ratelimit.ts`. | H2 (amplifies C1/C2) | **15 min** |
| 3 | **Add streaming body-size cap in `/api/chat` and `/api/tts`** before `req.json()`. Plus tighten Zod `image: z.string().max(7_500_000)`. | C3 | **1 hour** |
| 4 | **Scrub PII out of `console.error` in chat and TTS handlers.** New `scrubLog` helper; drop stack from stdout. | C4, M1 | **30 min** |
| 5 | **Migrate root layout to dynamic rendering + nonce-based CSP**, dropping `unsafe-inline`/`unsafe-eval` from script-src. | H1 | **1 day** |

After these five, the residual risk drops from "no-go" to "acceptable for paid soft-launch with monitoring". H3–H7 should follow within the first paid sprint.

---

## 8. Items requiring lawyer or external pentester

These cannot be resolved by code review alone. Capture them in a tracking issue.

1. **Verifiable parental consent under COPPA** — if the US market is in scope, no amount of engineering substitutes for legal review of the consent flow. See `legal-compliance.md` item #4.
2. **Penetration test before paid launch.** The recommended scope: authenticated SSRF probes against `/api/study/plans/from-utterance` (which accepts `exam_sample_photo_url` and may eventually be relaxed), JWT replay across child accounts, RLS bypass attempts via crafted Supabase REST calls, and prompt-injection campaigns against the chat with a goal of extracting the system prompt.
3. **OpenAI / Google data-processing agreements (DPAs)** signed and on file. `legal-compliance.md` documents the operator naming; the legal team must verify the executed DPAs include sub-processor clauses for Brazil.
4. **Vercel runtime log retention review.** Confirm Vercel team Read access list is minimal, log shipping is configured, and a documented procedure exists to scrub PII discoveries.
5. **Supabase token TTL policy decision.** A security architect (not engineer) should sign off on access=30min / refresh=7d trade-off vs. UX friction.
6. **Incident response runbook.** LGPD Art. 48 requires ANPD notification within "prazo razoável" (treated as 2 business days by ANPD case law). Draft `docs/security/incident-response.md` with templates and an escalation tree.
7. **Bug-bounty / disclosure policy.** Before paid launch, publish a `security.txt` at `/.well-known/security.txt` with a contact and an acknowledgement window. Without this, a security researcher will go directly to ANPD or the press.

---

**End of audit.**
