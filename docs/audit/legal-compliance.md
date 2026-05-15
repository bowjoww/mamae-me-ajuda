# Legal Compliance Audit — Mamãe Me Ajuda

**Audit date:** 2026-05-15
**Auditor role:** Legal Compliance Checker (codified review, not a substitute for counsel)
**Scope:** EdTech app for children (target user: Henrique, 12 yrs, Brasil). Source tree at `C:\Projetos\mamae-me-ajuda`, branch `feat/modo-prova-estudo-henrique` at `bb8c5b2`.
**Frameworks evaluated:** LGPD (primary), COPPA (US, expansion), GDPR-K (EU, expansion).

> **Disclaimer.** This audit reports what the code does and where it diverges from the named regulations. Anything labelled **`[NEEDS LAWYER]`** requires Brazilian counsel (and US/EU counsel before expansion) to sign off — the gating questions are factual-legal hybrids that no engineer should answer alone.

---

## 1. Executive summary

The product has done **better than typical pre-commercial EdTech on LGPD basics**: explicit parental consent gate, versioned consent log persisted in `consent_records`, named operators in the disclosure, OpenAI `store: false`, Sentry PII scrubbing, PostHog with `ip:false` + memory-only persistence + `respect_dnt`, and a working portability endpoint (`/api/account/export`). The privacy policy at `/privacidade` is unusually thorough for a pre-launch.

Despite that, **the product is not yet safe to commercialize** without addressing:

| # | Severity | Issue | Effort |
|---|----------|-------|--------|
| 1 | **CRITICAL** | No Terms of Service document anywhere in the repo. Required by LGPD Art. 9 and by every payment processor. | 1 day |
| 2 | **CRITICAL** | No account-deletion endpoint. Privacy policy promises "exclusão de dados" via `dpo@mamaemeajuda.com.br` — that mailbox does not yet exist and is not wired to any process. Violates LGPD Art. 18 III + V. | 2 days |
| 3 | **CRITICAL** | Consent can be recorded with `user_id: null` (pre-signup) and is **never reconciled** post-signup. The `consent_records_select_own` RLS policy filters by `user_id`, so the parent literally cannot see their own consent records. Audit-failure exposure under LGPD Art. 37 + ANPD requests. | 1 day |
| 4 | **CRITICAL (COPPA)** | If the US market is in scope, COPPA requires **verifiable** parental consent (credit-card auth, signed form, knowledge-based auth, government ID, or video call). The current checkbox-only flow is **insufficient under 16 CFR § 312.5(b)**. LGPD Art. 14 § 5 is friendlier (Brazil accepts "qualquer meio" reasonable in context), but COPPA will block US App Store / Play Store distribution. | 4–10 days |
| 5 | **HIGH** | `messages.content` table stores **full chat content indefinitely** — no TTL, no retention policy, no cron, no `retention_days` column. LGPD Art. 15 IV: data must be deleted when its purpose ends. **`[NEEDS LAWYER]`** on the exact retention period, but ~12 months is the typical EdTech defensible window. | 2 days (impl) + lawyer call |
| 6 | **HIGH** | `studentName` is stored in `localStorage` **before** consent is recorded for first-time visitors who type their name in `useStudentName`. Pre-consent collection violates Art. 7 + Art. 14. | 1 hour |
| 7 | **HIGH** | DPO email `dpo@mamaemeajuda.com.br` is in the privacy policy and export payload but no MX records / mailbox confirmed in repo. LGPD Art. 41 requires a working DPO channel. | 1 day |
| 8 | **MEDIUM** | No cookie/tracking-consent banner. PostHog is configured well, but LGPD Art. 7 + ANPD Guia de Cookies (Dec 2023) requires **opt-in** for non-essential analytics even when anonymized. | 1 day |
| 9 | **MEDIUM** | Privacy policy claims "Imagens enviadas — não armazenadas" but `messages.has_image = true` is stored. **The image itself isn't kept**, but the boolean signal is. Phrasing should clarify. | 30 min |
| 10 | **MEDIUM** | No data-breach response procedure documented. LGPD Art. 48 requires ANPD notification "em prazo razoável" (ANPD has been treating this as 2 working days). | 1 day |
| 11 | **LOW** | Sentry breadcrumbs may capture URLs containing UUIDs that join to PII tables. Scrubber catches names/emails/phones but not table-level joinability. | Acceptable risk for now. |

**Go/no-go recommendation:** **NOT READY for paid commercialization** in any jurisdiction. Items 1–7 are blockers. The hard gate is item 4 if US is in scope — checkbox consent will not survive an FTC inquiry, and Apple/Google now ask "is this Designed for Kids?" at submission time.

---

## 2. LGPD findings (Brasil — primary jurisdiction)

### 2.1 Art. 14 — Children and adolescents (the core question)

> *"§ 1º O tratamento de dados pessoais de crianças deverá ser realizado com o consentimento específico e em destaque dado por pelo menos um dos pais ou pelo responsável legal."*

**What the code does:**
- `ConsentModal.tsx` blocks the entire app behind a parental consent gate (lines 116–273).
- Consent is **specific and in destaque** (highlighted): dedicated modal, explicit checkbox, separate "Recusar" terminal screen that does not silently dismiss (lines 22–24 `handleEscape`).
- Consent is **versioned** (`CONSENT_POLICY_VERSION = "2026-04-20-v2"`) and re-prompted when the policy text materially changes (`loadConsent` line 29 in `src/lib/consent.ts`).
- Each acceptance is persisted to `consent_records` with `accepted_at`, `version`, `parental_consent: true` (route at `src/app/api/consent/route.ts`).

**Where it complies:**
- The disclosure names the controllers explicitly (OpenAI/GPT-5.1, Google/Gemini) per Art. 9 IV.
- Refusal is honored — without consent the app is unusable (Art. 7 § 4 — the controller cannot lawfully process without a legal basis).

**Where it falls short:**

1. **The checkbox does not verify parenthood.** A 12-year-old can tick the box themselves. LGPD § 5 says the controller must make "todos os esforços razoáveis" — the bar in Brazil is intentionally softer than COPPA but ANPD's draft kids' guide (consulta pública 53/2023) signals expectation of **at least a second factor** (e.g., parent's email confirmation, or a payment method that asserts adult ownership). **`[NEEDS LAWYER]`**: confirm whether checkbox alone is defensible *for a free pre-launch*, vs. paid commercialization where the bar climbs.

2. **Pre-signup consent is orphaned.** `src/app/api/consent/route.ts` lines 32–43 — when an unauthenticated visitor consents, the row lands with `user_id: null`. There is no later UPDATE that backfills `user_id` when the same browser session signs up. Combined with the `consent_records_select_own` RLS (002 migration line 22), the parent can never read their own consent log. ANPD audit-readiness gap.

3. **No consent withdrawal UX path.** Policy promises revocation, but there's no `/api/consent/revoke`, no UI button on `/perfil`, no event that clears `localStorage` + soft-deletes data. `clearConsent()` exists in `src/lib/consent.ts` line 41 but is unwired. Art. 8 § 5 — withdrawal must be "facilitada".

### 2.2 Art. 18 — Data subject rights

| Right | Implemented? | Where | Gap |
|-------|--------------|-------|-----|
| I — Confirmação | Partial | export endpoint | No standalone "you have an account" surface |
| II — Acesso | **Yes** | `/api/account/export` | Rate-limited 1/h — reasonable |
| III — Correção | Partial | `/api/children/[id]` PATCH | Only children — parent can't edit own email/name |
| IV — Anonimização / bloqueio / eliminação de dados desnecessários | **No** | — | No retention policy on `messages` |
| V — Eliminação de dados tratados com consentimento | **No** | — | No DELETE account endpoint; cascade is wired in schema (`on delete cascade` on every FK) so deletion **would** work if exposed, but no surface exposes it |
| VI — Portabilidade | **Yes** | `/api/account/export` | Excellent — returns full JSON, documents scope explicitly |
| VII — Informação sobre compartilhamento | **Yes** | `/privacidade` § 5 | Named operators |
| VIII — Informação sobre consequência da negativa | **Yes** | "Sem consentimento, sem acesso" screen | Explicit |
| IX — Revogação | **No** | — | UX exists in policy text only; no code path |

**Action items for Art. 18 compliance:**
- Add `DELETE /api/account` (uses `supabase.auth.admin.deleteUser(user.id)` server-side with the service-role key — RLS won't help here, need admin client).
- Add `POST /api/consent/revoke` that inserts a `revoked` record AND triggers the deletion.
- Add a `/perfil` action: "Excluir minha conta e dados" → confirmation modal → calls the DELETE endpoint.

### 2.3 Art. 9, IV + Art. 6 (transparency)

The privacy policy at `src/app/privacidade/page.tsx` is **strong**. It names each operator (lines 99–117), states purpose, and gives a DPO email. Two fixable issues:

- **§ 2 "Imagens enviadas — processadas pela IA e não armazenadas"** is technically true (image bytes don't hit the `messages` table per `chat/route.ts` line 165 — only `has_image: true` boolean). But the phrasing implies *zero* trace; the `has_image` boolean is also personal data when linked to a `parent_id`. Rephrase: "O conteúdo binário da imagem não é armazenado em nossos servidores. Registramos apenas que houve envio de imagem nessa mensagem."
- **§ 7 "criptografia em trânsito"** doesn't claim at-rest encryption. Supabase Postgres **is** encrypted at rest by default — the policy can claim both honestly.

### 2.4 Art. 41 — DPO requirement

LGPD Art. 41 requires the controller to indicate an "encarregado pelo tratamento de dados pessoais". The privacy policy lists `dpo@mamaemeajuda.com.br`. **`[NEEDS LAWYER]`**:
- Is there a real person backing this address?
- Is there an internal procedure to respond within 15 days (ANPD's published expectation for Art. 18 responses)?
- A small operator (Giovanni solo + Henrique-zero) can self-designate as DPO, but must publish the role and accept the mailbox.

### 2.5 Art. 48 — Breach response

**Not present in repo.** No `docs/security/incident-response.md`, no runbook for ANPD notification. If Supabase is compromised, the obligation under Art. 48 fires within "prazo razoável" (ANPD enforcement has been treating this as 2 business days). Cost-aware mitigation: a 1-page incident playbook + a saved email template, kept in `docs/legal/breach-response.md`.

---

## 3. COPPA gap analysis (US — if expanding)

**Applies if:** any user is reasonably knowable to be under 13, OR the app is "directed to children" (which this one clearly is — kid-targeted, study mode, gamification, no age-gate to keep adults out). Per **16 CFR § 312**, the bar is **substantially higher** than LGPD Art. 14.

### 3.1 Verifiable Parental Consent (VPC) — the killer requirement

COPPA § 312.5(b) accepts only these methods:
1. Signed consent form returned by mail/fax/scan
2. Credit/debit card transaction (any non-zero charge, even refunded)
3. Government-issued ID check
4. Knowledge-based authentication (questions only the parent can answer)
5. Video conference with trained personnel
6. Email-plus (consent email + delayed confirmation with phone/letter follow-up) — *cheapest viable path*

**Current implementation: bare checkbox.** Does not meet *any* of the six. This is the **single biggest blocker** for US launch. The FTC has fined comparable EdTech apps (TikTok 2019 — $5.7M, Epic Games / Fortnite 2022 — $275M, Microsoft / Xbox 2023 — $20M) precisely on this point.

**Recommended path (cheapest defensible):** Email-plus.
- Collect parent email separately from kid signup.
- Send a confirmation link the parent must click *and* respond to a follow-up email 24h later.
- Persist both confirmations to `consent_records.coppa_email_plus_verified_at`.

### 3.2 Notice required at § 312.4

A *direct notice* to the parent — not just a website privacy policy — is required. The current modal text is close but needs:
- Operator name + physical address (legal entity, not "Mamãe Me Ajuda").
- Specific categories of personal info collected — already present.
- Statement that parent can review, delete, refuse further collection — present in policy but **must be in the direct notice**.
- Internal procedures for confidentiality.

### 3.3 Data minimization (§ 312.7)

Cannot condition participation on disclosure of more info than reasonably necessary. Current implementation **conditions all use on `studentName`** in the chat flow — this is borderline. The sanitizer caps it at 50 chars and uses a placeholder default ("estudante") which helps. **`[NEEDS LAWYER]`** on whether first-name-only counts as "reasonably necessary for the activity" — strong argument yes, since the tutor personalizes responses.

### 3.4 No behavioral advertising (§ 312.5(c)(2))

PostHog **is not** running ad-targeting code (no Meta Pixel, no Google Ads, no DSP integration spotted in source). Good. Keep it that way; the moment a marketing pixel ships, COPPA Section 5 issues fire.

### 3.5 Third-party operator obligations (§ 312.8)

Each of OpenAI, Google (Gemini), Sentry, PostHog, Supabase must commit (contractually) to:
- Confidentiality of children's PI
- No retention beyond what's reasonably necessary
- Secure disposal

OpenAI's API DPA (with `store: false` toggled) covers this in current ToS; Google Gemini API DPA covers it; Supabase enterprise DPA covers it. **`[NEEDS LAWYER]`**: pull each operator's DPA and verify they explicitly cover children's data — some processors carve children's data out by default.

---

## 4. GDPR-K gap analysis (EU — if expanding)

**Article 8 GDPR** sets the digital-services consent age. Brazil and the US set it at **13**; the EU sets it at **16 by default** but Member States may lower to **13–15**. The German age is 16, French is 15, Spanish is 14, Portuguese is 13. **A 12-year-old user requires parental consent in every EU jurisdiction**.

### 4.1 Specific gaps vs. LGPD baseline

| GDPR-K requirement | LGPD analog? | Current state | Gap |
|--------------------|--------------|---------------|-----|
| Art. 8 — parental consent for <16/15/14/13 | Art. 14 | Yes, checkbox | **Insufficient**: GDPR's Art. 8(2) requires the controller to make "reasonable efforts to verify" — checkbox not enough, similar to COPPA |
| Art. 12 — clear, plain language for children | Art. 6, I | Policy at adult reading level | **Add a "child-readable" version** of the privacy notice — simple text, kid-friendly |
| Art. 13 — info at collection point | Art. 9 | Disclosed in modal | OK |
| Art. 15 — right of access | Art. 18 II | `/api/account/export` | OK |
| Art. 17 — right to erasure ("right to be forgotten") | Art. 18 V | **Missing endpoint** | Critical |
| Art. 20 — portability | Art. 18 VI | `/api/account/export` | OK |
| Art. 30 — Records of Processing Activities (ROPA) | Art. 37 | **No ROPA document in repo** | Required for any controller |
| Art. 32 — security of processing | Art. 46 | TLS + RLS + Sentry scrub | Acceptable for now |
| Art. 33 — breach notification (72h) | Art. 48 | No procedure | Tighter than LGPD; need playbook |
| Art. 35 — DPIA for high-risk processing | Art. 38 | **Not done** | Children + AI processing = **DPIA mandatory** under Art. 35(3)(b) |
| Art. 37 — DPO for systematic monitoring of children at large scale | Art. 41 | dpo@ exists | If scale grows, formal DPO appointment becomes mandatory |
| Art. 44+ — cross-border transfers | n/a | OpenAI/Google in US, Sentry/PostHog regions vary | **Need Standard Contractual Clauses (SCCs) on file for each** |

### 4.2 The big-ticket item: DPIA

GDPR Art. 35(3)(b) explicitly requires a Data Protection Impact Assessment when processing involves children at scale plus profiling. The XP/quest/streak system is profiling under Art. 4(4). Skipping the DPIA is a documentable failure that DPAs (Datenschutzbehörden) ding heavily.

A first-pass DPIA template lives at the EDPB website. Estimated effort: 2 days of writing + 1 day of internal review.

### 4.3 Cookie/tracking consent (ePrivacy Directive)

In the EU, ePrivacy applies *in parallel* with GDPR. **Non-essential** trackers (PostHog analytics count) require opt-in **before** the script loads. Current flow lazy-loads PostHog without a banner. The mitigations in place (`ip: false`, `persistence: 'memory'`, `respect_dnt`) reduce risk but **do not exempt** under EU caselaw post-Planet49 (CJEU C-673/17, 2019).

For EU launch: add a cookie/tracking consent banner that gates PostHog initialization.

---

## 5. Privacy policy / ToS — what exists vs what's needed

### 5.1 Privacy policy

**Exists:** `src/app/privacidade/page.tsx` (193 lines, last updated 2026-04-20 to v2).

| Section | Coverage | Quality |
|---------|----------|---------|
| Who we are | § 1 | Adequate |
| Data collected | § 2 | Mostly accurate (image clarification needed) |
| LGPD Art. 14 acknowledgment | § 3 | Good |
| Purpose | § 4 | Good |
| Third-party operators (Art. 9, IV) | § 5 | **Excellent** — named, with `store: false` claim |
| User rights | § 6 | Good — explicit Art. 18 enumeration + portability deep link |
| Security | § 7 | Light — adds value to claim at-rest encryption too |
| Contact / DPO | § 8 | **`[NEEDS LAWYER]`** — confirm DPO mailbox actually exists |

**Recommended additions before commercialization:**
- Retention table (per category — what we keep, for how long, on what basis).
- Cross-border transfer disclosure (data leaves Brazil via OpenAI/Google US).
- Children's-version notice in child-readable language (≤6th-grade reading level).
- Cookie & tracking section if a banner is added.

### 5.2 Terms of Service

**Does not exist.** No `/termos`, `/terms`, `/tos`, or equivalent route. `Grep` for `termos|terms|TermsOfService|ToS` returned 9 files — all of them are tests, the privacy page, or the consent modal referencing legal context. **None is a ToS document.**

This is a hard blocker for:
- App Store / Play Store submission ("Privacy Policy URL" + "EULA" both required).
- Payment processor onboarding (Stripe, MercadoPago, Pagar.me all require both).
- LGPD Art. 6, II — adequação (the legal basis chain has to be documented somewhere, and ToS is the canonical place).

**Minimum sections required:**
1. Acceptance of terms (gated by the existing consent modal).
2. Description of service (chat tutoring, study planning, gamification — **not** professional educational advice; explicit disclaimer).
3. Account & age requirements (parent ≥ 18; child < 18; in Brazil; parent legally responsible).
4. Acceptable use (no harmful content; moderation may block).
5. Intellectual property (ours: code/UI/branding; theirs: user-submitted content — note minor's content limitations).
6. Disclaimers (no medical/legal/psychological advice; tutoring is supplementary).
7. Limitation of liability.
8. Termination (we can suspend; user can delete via `/api/account` once built).
9. Governing law (Brasil — foro de São Paulo or wherever Giovanni's PJ is registered).
10. Changes to terms (notification + 30-day cooling-off for material changes).

**Effort estimate:** 1 day with a Brazilian counsel review (~R$ 500–1500 if outsourced) or 2 days self-drafted from a vetted EdTech template + lawyer review.

---

## 6. Data flow map (origin → processor → retention)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            PARENT/CHILD (browser, BR)                            │
└────────────────────────────────────┬─────────────────────────────────────────────┘
                                     │
       ┌─────────────────────────────┼──────────────────────────────────┐
       │                             │                                  │
       ▼                             ▼                                  ▼
┌──────────────┐            ┌────────────────┐                ┌──────────────────┐
│  localStorage│            │  Mamãe Me      │                │  PostHog (EU/US) │
│  (browser)   │            │  Ajuda API     │                │  ip:false,       │
│              │            │  (Vercel,      │                │  memory-only,    │
│ - consent    │            │   Brasil edge) │                │  no recording    │
│   record     │            │                │                │                  │
│ - student    │            │                │                │ Retention: per   │
│   name       │            │                │                │ PostHog defaults │
│ - intro seen │            │                │                │ (~7y unless      │
│ - active     │            │                │                │ overridden)      │
│   plan/child │            │                │                │ [NEEDS REVIEW]   │
└──────────────┘            └────────┬───────┘                └──────────────────┘
   Retention:                        │
   Until clearConsent()              │
   (manual, no UX)                   ├──────────────────┐
                                     ▼                  ▼
                          ┌──────────────────┐  ┌──────────────────┐
                          │  Supabase        │  │  Sentry (US/EU)  │
                          │  Postgres        │  │  sendDefaultPii  │
                          │  (region:        │  │  =false, PII     │
                          │   [NEEDS CHECK]) │  │  scrubbed via    │
                          │                  │  │  regex           │
                          │  Tables:         │  │                  │
                          │  - children      │  │  Retention:      │
                          │  - conversations │  │  Sentry default  │
                          │  - messages      │  │  (30/90d on free │
                          │  - consent_      │  │  tier; project   │
                          │    records      │  │  configurable)   │
                          │  - study_*       │  │                  │
                          │  - flashcards    │  └──────────────────┘
                          │  - user_profile  │
                          │  - xp_events     │
                          │                  │
                          │  Retention:      │
                          │  INDEFINITE      │
                          │  ❌ NO TTL       │
                          │  ❌ NO CRON      │
                          └────────┬─────────┘
                                   │
                                   │ (chat content forwarded
                                   │  per request — not stored
                                   │  by operator)
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                                     ▼
       ┌─────────────────┐                  ┌──────────────────┐
       │  OpenAI         │                  │  Google Gemini   │
       │  Responses API  │                  │  generative      │
       │  (US)           │                  │  language API    │
       │                 │                  │  (US, multi-     │
       │  store: false ✓ │                  │  region)         │
       │  (confirmed in  │                  │                  │
       │  aiTutor.ts:158 │                  │  store: false ✓  │
       │  and :291)      │                  │  (claimed in     │
       │                 │                  │  policy; **not   │
       │  Retention by   │                  │  enforced in     │
       │  OpenAI: 0 days │                  │  code** — Gemini │
       │  for store=false│                  │  SDK call in     │
       │                 │                  │  chat/route.ts   │
       │                 │                  │  :91-137 does    │
       │                 │                  │  not pass a      │
       │                 │                  │  store flag      │
       │                 │                  │  because Gemini  │
       │                 │                  │  has different   │
       │                 │                  │  API semantics)  │
       └─────────────────┘                  └──────────────────┘
```

### Critical observations on the map

1. **Supabase has no TTL.** Indefinite retention of `messages.content` (raw chat text) is the largest unmitigated risk. Even an LGPD-conservative reading of Art. 15 IV would push toward 12 months max.

2. **`store: false` is enforced for OpenAI** (`src/lib/services/aiTutor.ts:158`, `:291`) — verified accurate.

3. **`store: false` is *not* explicitly set for Gemini.** `chat/route.ts:91-137` does not pass a store-disabling flag. Google's Gemini API has its own data-handling defaults — per [Google's Gemini API ToS](https://ai.google.dev/gemini-api/terms), free-tier traffic *is* used for product improvement (different from OpenAI default). Paid-tier traffic has stronger guarantees. **Verify which tier the API key is on; if free, the privacy policy's claim is materially inaccurate** for the Gemini path.

4. **Supabase region not confirmed in source.** Look at `NEXT_PUBLIC_SUPABASE_URL` — if it's a `*.supabase.co` hostname pointing to `us-east-1` or `eu-west-1`, that's an international transfer that should be disclosed in the policy. LGPD Art. 33 permits this with proper safeguards. **`[NEEDS REVIEW]`**: confirm Supabase region in deployment config.

5. **PostHog retention.** PostHog Cloud's default retention is 7 years on most plans. The privacy policy implies analytics is "to improve the app" — keeping 7 years of usage events is excessive under Art. 15 IV. Configure PostHog org-level retention to 12 months.

6. **Sentry retention.** Sentry's free/team tier retains issues 30/90 days; Business tier retains 90 days; Enterprise allows up to 7 years. **Document the chosen retention** in the privacy policy.

---

## 7. Recommended immediate actions (prioritized)

### Pre-commercialization blockers (must do)

**Sprint 1 (week 1) — Legal documents & deletion**
1. **Write a Brazilian ToS.** 1 day self-drafted from a vetted EdTech template + 1 day lawyer review. Mount at `/termos`. Link from consent modal + privacy page footer.
2. **Implement `DELETE /api/account`.** Uses `supabase.auth.admin.deleteUser()` server-side with service-role key. Cascade FKs will handle children/messages/etc. Add `/perfil` button with two-step confirmation.
3. **Implement `POST /api/consent/revoke`.** Inserts a revocation record, clears localStorage, optionally triggers account deletion.
4. **Reconcile pre-signup consent.** On post-signup, UPDATE `consent_records SET user_id = $newId WHERE user_id IS NULL AND accepted_at > (signup_time - 24h)`. Belt-and-suspenders: dedupe within 24h window.
5. **Stand up `dpo@mamaemeajuda.com.br`.** Configure MX, monitored inbox, 15-day SLA. Document in `docs/legal/dpo-procedure.md`.

**Sprint 2 (week 2) — Retention & consent strengthening**
6. **Add retention policy on `messages`.** Either: (a) `messages.expires_at` column + nightly cron via `pg_cron`, or (b) policy of 12 months from `created_at`. Update privacy policy § 2 to disclose this.
7. **Configure PostHog org retention to 12 months.** UI: Project Settings → Data Management.
8. **Fix Gemini `store: false` semantics.** Verify whether API key is on paid tier (where data is not used for training) OR migrate fully to OpenAI (cleaner story). Update policy text accordingly.
9. **Move `studentName` collection to *after* consent.** `useStudentName` should not write to localStorage on initial page load before `useConsent` returns true.
10. **Cookie/tracking-consent banner.** Even if minimal — a "Personalize/Accept all" prompt that gates PostHog `init()`.

### Pre-US-launch blockers

11. **VPC via email-plus.** Cheapest defensible COPPA method. ~3 days of implementation: parent email collection, double opt-in, 24h delayed confirmation.
12. **§ 312.4 direct notice document.** Distinct from privacy policy. ~1 day.
13. **Each operator DPA review (OpenAI, Google, Sentry, PostHog, Supabase).** Confirm contractual children's-data carve-ins. ~1 day per operator.

### Pre-EU-launch blockers

14. **DPIA.** Mandatory under Art. 35(3)(b). ~3 days.
15. **ROPA document.** Mandatory under Art. 30. ~1 day.
16. **Child-readable privacy notice.** ~6th-grade reading level Portuguese (and translated when EU launches). ~1 day.
17. **SCCs on file for cross-border transfers.** Standard Contractual Clauses for each US-hosted operator. ~1 day legal admin.
18. **Cookie banner is mandatory** (not optional like LGPD).

### Defensive nice-to-haves

19. **Breach response runbook** at `docs/legal/breach-response.md`. ANPD email template + 48h timeline.
20. **Internal data-handling SOP** at `docs/legal/data-handling.md`. Who has Supabase admin access, audit log policy, key rotation.
21. **Re-prompt consent at policy v3.** The versioning already supports this; document the trigger criteria (any new operator, any new data category, any change in retention).

---

## 8. Items flagged `[NEEDS LAWYER]`

A consolidated list for the next consult call:

1. Is checkbox-only consent defensible under LGPD Art. 14 § 5 for a paid product targeted at minors? (Probably not — ANPD's draft kids' guide leans stricter.)
2. What is the right retention period for `messages.content` for an EdTech chat tutor? (Industry: 12 months is typical; some argue 90 days is defensible.)
3. Is the DPO requirement triggered for a solo-operator pre-revenue startup, or is self-designation sufficient under ANPD's small-business carve-out?
4. Confirm OpenAI Responses API + `store: false` + Brazilian children's data → contractually safe under existing OpenAI ToS or do we need an enterprise DPA?
5. Same question for Google Gemini (specifically the free-tier training carve-in).
6. Required scope of the direct § 312.4 notice for COPPA if US is launched.
7. Is "first name only, used for personalization" defensible under COPPA § 312.7 data minimization?
8. Which EU member states will see traffic first? (Drives age threshold — Germany 16, Spain 14, Portugal 13.)

---

**Audit author:** Legal Compliance Checker (codified review only)
**Files reviewed:**
- `src/app/components/ConsentModal.tsx`
- `src/lib/consent.ts`
- `src/app/api/consent/route.ts`
- `src/app/privacidade/page.tsx`
- `src/app/api/account/export/route.ts`
- `src/middleware.ts`
- `src/app/providers/PostHogProvider.tsx`
- `src/app/providers/PostHogClientLoader.tsx`
- `src/lib/analytics.ts`
- `src/app/api/chat/route.ts`
- `src/lib/services/aiTutor.ts`
- `src/lib/services/openaiClient.ts`
- `src/lib/moderation.ts`
- `src/lib/hooks/useConsent.ts`
- `src/lib/hooks/useStudentName.ts` (header read)
- `src/app/api/children/route.ts`
- `src/app/api/children/[id]/route.ts`
- `src/app/api/conversations/route.ts`
- `src/app/api/conversations/[id]/route.ts`
- `src/app/api/auth/signup/route.ts`
- `src/app/perfil/page.tsx`
- `src/app/layout.tsx`
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_consent_records.sql`
- `supabase/migrations/003_study_and_gamification.sql` (header read)

**Out of scope (not reviewed in detail):** PCI-DSS (no payment flow yet), HIPAA (not health data), SOX (not US public co), full text of operator DPAs (off-repo).
