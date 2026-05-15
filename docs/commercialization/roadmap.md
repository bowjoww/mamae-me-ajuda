# Commercialization Roadmap — Mamãe Me Ajuda

**Status**: Draft v0.1 — for Giovanni's review
**Author**: Alex (PM)
**Date**: 2026-05-15
**Decision window**: 7 days

---

## TL;DR — the only paragraph that matters

We have a working product with one user (Henrique). The Board asked how to take it to "mais pessoas, talvez Android e iPhone". Mobile native apps are a distraction in 2026 — the PWA already ships to iOS/Android home screens. The real questions are: **who pays, how much, and what kills us before product-market fit?** This doc takes a hard position: **target Brazilian parents of 6º–9º ano kids, sell a single R$ 39/month family plan, find 10 paying families before writing a single line of native iOS code.** Everything else is premature scaling.

---

## 1. ICP Definition — Who Actually Pays

### The triangle of EdTech buyers

Every consumer EdTech sale has three roles. They are rarely the same person.

| Role | Who | What They Care About |
|------|-----|---------------------|
| **Buyer** (pays the bill) | Mom or dad of a 11–15 yo | "Did the grades go up? Is the kid actually using it? Is it safe?" |
| **Decider** (picks the product) | Same parent, sometimes both | "Does this look credible? Is there a free trial? Will the kid actually open it?" |
| **User** (the kid) | 11–15 yo, 6º–9º ano | "Is this cringe? Faster than asking ChatGPT? Does it judge me?" |

**Critical insight:** The kid has veto power but not buying power. If we optimize the product for parents (dashboards, reports, grade tracking) we lose the kid. If we optimize purely for the kid (gamification, no oversight) we lose the parent. The product must look different to each — that's why we already have Modo Perfil (kid view) and need Modo Pais (parent view).

### Primary ICP — Pick ONE, not three

**Mãe ou pai de classe média-alta, 35–48 anos, capital ou grande cidade, filho(a) entre 11–15 anos em escola particular, com queda recente de notas ou ansiedade pré-prova.**

Concrete signals:
- Já paga reforço escolar (R$ 200–800/mês) ou já contratou e cancelou
- Está no WhatsApp das mães da turma e troca dicas de estudo
- Usa ChatGPT no celular mas não confia em deixar o filho usar sozinho
- Mora em SP, RJ, BH, Curitiba, Vitória, Vila Velha, Florianópolis — capitais ou cidades com escolas particulares fortes
- Renda familiar R$ 12k–35k/mês

**Why this ICP and not "all Brazilian students":**
1. **They can pay R$ 39/month without thinking about it.** That's less than one reforço session.
2. **They feel guilt about not helping with homework.** This is the emotional wedge that closes the sale, not the AI tech.
3. **They are reachable.** Instagram ads + WhatsApp word-of-mouth. We don't need to crack public school distribution (which is a B2G nightmare).

### Who we are NOT targeting in v1.0

- Public school families (lower ARPU, harder distribution, requires B2G or NGO partnerships)
- ENEM/vestibular students (different product — Stoodi/Geekie own this, AV2 discursive isn't the format)
- Adult learners (different motivation, different price ceiling)
- The kid as a direct buyer (no card, won't pay, churns)

---

## 2. Positioning — The Category We're Inventing

### What category are we in?

We are not "AI tutor" (Khanmigo owns the global mindshare). We are not "reforço online" (Stoodi/Geekie own that). We are not "homework helper" (Photomath/ChatGPT own that).

**Category:** *"Tutora particular de IA pra criança que detesta estudar"* — a study companion for the unmotivated middle-school kid, designed to be opened voluntarily, not assigned by a parent.

### The four-quadrant map

```
                  HIGH MOTIVATION KID
                          |
              Khan/Stoodi |  Khanmigo (US)
              (cursos)    |  (premium tutor)
                          |
LOW PARENT  ──────────────┼──────────────  HIGH PARENT
INVOLVEMENT               |                INVOLVEMENT
                          |
              ChatGPT     |  ★ Mamãe Me Ajuda
              (raw cheat) |  (guided, parent-visible)
                          |
                  LOW MOTIVATION KID
```

**Our quadrant is empty in Brazil today.** ChatGPT is in the bottom-left (kid uses it as a cheat machine, parent has no visibility). Khan Academy is top-left (assumes the kid wants to learn courses). Stoodi/Geekie are course-content factories aimed at ENEM. Khanmigo isn't in PT-BR with LGPD compliance and isn't priced for Brazilian families.

### One-line positioning

> **"O ChatGPT que não entrega a resposta pronta, ensina seu filho a pensar, e te mostra o que ele estudou."**

This sentence does three jobs:
- Uses a reference parents already know (ChatGPT)
- Promises the pedagogical wedge (socratic, doesn't hand over the answer)
- Promises the parent wedge (visibility/dashboard)

### Direct comparisons (be ready when asked)

| Competitor | What They Do Well | Where We Win |
|-----------|-------------------|--------------|
| **ChatGPT** | Knows everything, free | Doesn't teach, no parent view, no LGPD framing, kid cheats |
| **Khan Academy** | Free, rigorous courses | Assumes kid is motivated, no PT-BR AV2 alignment, no chat |
| **Khanmigo** | Best tutor AI globally | Not in PT-BR, no LGPD, US$ 4/month but US pricing, no parent dashboard for BR market |
| **Stoodi / Geekie** | Cursos completos pra ENEM | Aimed at ensino médio, not 6º–9º ano, video-heavy, no AV2 discursive simulator |
| **Photomath** | Resolve foto da equação | Só matemática, dá resposta pronta (anti-pedagógico), zero engajamento |
| **TutorMe / Brainly** | Q&A com humanos | Mais caro, latência alta, sem gamification, sem visibilidade parental |
| **Reforço particular humano** | Eficaz, personalizado | R$ 200–800/mês, agendamento, kid resiste |

**Our moat is not the AI** — Gemini and GPT are commodities. **Our moat is the product wedge:** kid-credible UX (sandbox theme, gamification, doesn't feel like school) + parent peace-of-mind (dashboard, LGPD, safety) + Brazilian school calendar fit (AV2 discursiva, simulados, formatos reais).

---

## 3. Pricing Hypotheses — Three Models, One Pick

### Cost baseline (must understand before pricing)

Per **active** user/month, conservative estimate with Gemini 2.5 Flash as default and GPT-5.1 fallback:

| Component | Cost per active user/month | Notes |
|-----------|----------------------------|-------|
| Gemini 2.5 Flash chat (avg 200 turns × ~2k tokens) | R$ 2–4 | At ~US$ 0.10/1M input + 0.40/1M output, generously sized |
| OpenAI TTS (10% of messages spoken, ~500 chars avg) | R$ 1–2 | Optional feature, cap it |
| GPT-5.1 for Modo Prova/Estudo (heavier prompts) | R$ 2–6 | Cap to 50 simulado generations/month |
| Supabase + Vercel + Upstash + Sentry | R$ 1–2 | Fixed-ish, amortizes over scale |
| Image moderation (OpenAI moderation API) | R$ 0.20 | Per ~1000 calls |
| **Total per active user/month** | **R$ 6–14** | **Use R$ 10 as planning number** |

**Heavy-user tail risk:** A motivated kid in exam week could 10x this. Hard cap at R$ 25/user/month via per-user token budgets enforced server-side. This is non-negotiable for unit economics — implement before opening payments.

### The three pricing hypotheses

#### Option A — Freemium (10 questions/day free, paid removes cap)

| Metric | Value |
|--------|-------|
| Free tier | 10 chat turns/day, no Modo Prova, no Modo Estudo |
| Paid tier | R$ 29/month — unlimited, all 4 modes |
| Per-user cost free | R$ 1–2 (light usage, capped) |
| Per-user cost paid | R$ 10 |
| Conversion assumption | 4% (industry standard for freemium consumer ed) |
| Blended unit margin | **Negative until ~3% conversion + scale** |

**Verdict:** Free tier burns AI cost to acquire users who mostly won't convert. Bad for an early-stage product with R$ 10/user variable cost. Reject for v1.0.

#### Option B — Pure subscription, 7-day free trial (RECOMMENDED)

| Metric | Value |
|--------|-------|
| Trial | 7 days, full product, no card upfront* |
| Paid tier | R$ 39/month or R$ 349/year (R$ 29/month equivalent) |
| Per-user cost | R$ 10/month (capped at R$ 25) |
| Gross margin | **74% at R$ 39** |
| Trial → paid conversion target | 25% (achievable with strong onboarding + parent dashboard at end of trial) |
| Annual plan adoption target | 30% of payers (locks in the cohort past one exam cycle) |

*Card upfront is a separate Giovanni decision — see §8 question 3. No-card trials get 3–5x more signups but convert lower. Card-upfront converts 40%+ but cuts trial volume in half. For Brazil, I'd start no-card.

**Verdict:** This is the recommendation. Clean unit economics, parents understand subscriptions, predictable LTV.

#### Option C — Family plan with multi-child + parent dashboard

| Metric | Value |
|--------|-------|
| Tier 1 — Solo | R$ 39/month, 1 kid |
| Tier 2 — Família | R$ 59/month, up to 3 kids, parent dashboard included |
| Per-user cost | R$ 10/kid (R$ 20–30 in family plan) |
| Gross margin family plan (2 kids avg) | **66% at R$ 59** |
| ARPU lift | Higher — captures siblings who would otherwise free-ride |

**Verdict:** Yes, but **as v1.1 in month 3, not at launch.** Adds product complexity (multi-child UX, dashboard, parent account vs child account). Validate that R$ 39 solo subscription works first, then upsell families.

### Pricing pick

**Launch with Option B at R$ 39/month + R$ 349/year. Add Option C family plan at R$ 59 once we have 50 paying solo families.**

R$ 39 is the price ceiling where a parent doesn't ask "wait, is this worth it?" — it sits below the lowest reforço session (~R$ 80/hour) and matches what they already pay for Netflix or Spotify Família. Pricing higher requires a sales motion we don't have. Pricing lower destroys margin and signals low quality.

---

## 4. MVP Scope for v1.0 Commercial — What MUST Exist

The product works for Henrique because Giovanni hand-set everything. Below is what must exist for an arbitrary parent in São Paulo to sign up at 9pm on a Sunday and have their kid using it by 9:15pm.

### Gap analysis vs. today

| Capability | Today | Required for v1.0 |
|------------|-------|-------------------|
| Auth — kid identifies by name only | ✅ works for Henrique | ❌ Need parent account with email/password |
| Parent → Child relationship | ❌ none | ✅ One parent account → 1+ child profiles |
| Payment | ❌ none | ✅ Stripe or Mercado Pago, BRL, monthly + annual, cancel anytime |
| Parent dashboard | ❌ none | ✅ "What did meu filho study, for how long, what subjects, what's the streak" |
| Privacy Policy (LGPD compliant) | ⚠️ partial (consent modal exists) | ✅ Full LGPD doc + minor consent flow |
| Terms of Service | ❌ unclear | ✅ Required for payment processor anyway |
| Refund flow | ❌ none | ✅ "First 14 days, no questions asked" + UI button |
| Support channel | ❌ none | ✅ WhatsApp Business + help@ email, 24h SLA |
| Per-user cost cap | ❌ unbounded | ✅ Server-side token budget, R$ 25/user/month hard cap |
| Onboarding for non-Henrique | ⚠️ assumes the kid is ready | ✅ Parent sets up child profile → kid receives link → first session has guided tour |

### The three things I'd build first (and the seven I'd defer)

Forcing function: 30 days of engineering, 1 PM, 1 designer, no native mobile. Pick three.

**BUILD (must ship before any paid customer):**

1. **Parent account + child profile + Mercado Pago subscription.** End-to-end paid signup is the entire commercial product. Without this we are still a free hobby app.
2. **Parent dashboard v0 (read-only weekly summary).** This is the *closing argument* of the trial. After 7 days, the parent gets an email: "Aqui está o que [Nome do filho] estudou esta semana." If that email lands well, conversion happens. Skipping it sends parents into pure "did the grade go up" judgment, which takes a full exam cycle (4–8 weeks) and we lose them before then.
3. **Per-user cost cap + LGPD-clean privacy policy + ToS.** Non-negotiable for liability and unit economics. Cheap to build, catastrophic to skip.

**DEFER (looks tempting, isn't worth month-1 scope):**

- Native iOS/Android apps (PWA already installs to home screen — see §7 risks)
- Multi-child family plan (validate solo first)
- WhatsApp delivery / bot
- Teacher dashboards (different ICP entirely)
- Push notifications beyond PWA basics
- School calendar integration / canvas sync
- Live human tutor escalation
- Detailed analytics beyond weekly summary

---

## 5. GTM Brasil — Three Channels, Not Ten

Most early-stage products fail because they spread thin across ten channels and never get signal on any. We pick three, run each for 30 days, kill the worst two.

### Channel 1 — Instagram parent micro-influencers (PRIMARY BET)

**Why:** Mães-influencers (10k–80k followers) in the "filho que detesta estudar" niche have *exactly* our buyer audience. They already do paid promotion. Cost is bounded (R$ 500–3000 per post). Attribution is clean (UTM + promo code).

**Test:** Identify 15 micro-influencers, pitch 5 for paid partnership in month 2. Target metric: CAC < R$ 100 at R$ 39 MRR (12-month payback).

**Why not bigger creators:** Macro-influencers (>500k) charge R$ 20k+ per post and audiences are mixed. Micro is where parent intent is dense.

### Channel 2 — WhatsApp grupos de mães (ORGANIC + REFERRAL)

**Why:** This is how Brazilian middle-class parents actually decide on services. One mãe in the grupo da turma recommending = 5 sales. We don't post into groups directly (spammy + likely banned); we build a referral program: "Indique uma amiga, ganhem ambos 1 mês grátis."

**Test:** Add referral mechanic in month 2 (after first 20 paying families). Target metric: viral coefficient k > 0.3 (each customer brings 0.3 more on average).

**Risk:** This only works if the product genuinely delights the first cohort. If churn is high, referral is dead-on-arrival. Stress test with the closed-beta cohort before scaling.

### Channel 3 — Content + SEO (LONG GAME, MONTH 2+)

**Why:** "Como ajudar meu filho a estudar" is a high-intent search term. One ranked article = compounding free acquisition. But SEO is a 6–12 month bet; we don't expect MRR from this in 90 days.

**Test:** Write 4 long-form articles in month 2, optimize for Brazilian middle-school exam pain points (AV2, simulado, vestibulinho, queda de notas). Track organic clicks → trial signup over 90 days.

**Why not paid Google Ads:** Education keywords in BR have CPCs of R$ 4–12. With R$ 39 MRR and ~25% trial conversion, the math is brutal until we have repeat purchase data. Revisit at month 6 with cohort LTV.

### What we are NOT doing (and why)

- **TikTok organic creator content** — slower attribution, audience too young (the kid, not the buyer)
- **Facebook Ads** — overlaps with Instagram, harder to target the parent niche cleanly
- **PTA / Associação de Pais e Mestres direct outreach** — high-touch, low-throughput, can't scale a sales team yet
- **Influencer YouTube long-form** — too expensive for our CAC envelope
- **School partnerships (B2B)** — entirely different sales motion; 6–18 month cycles; revisit in 2027 with proven B2C product

---

## 6. 90-Day Roadmap

### Month 1 (May 15 – Jun 14) — Close the Commercial Gaps

**Theme:** Make the product transactable. No new features, no native apps, just enough plumbing to take money.

| Week | Deliverable | Owner | Success Gate |
|------|------------|-------|--------------|
| 1 | Parent account schema + Supabase migrations applied | Backend | parent_users table live, RLS verified |
| 1 | Mercado Pago integration spike (chosen over Stripe — local cards, PIX, boleto) | Backend | Test charge + webhook receives event |
| 2 | Child profile model — parent owns 1..N children, current single-user data migrates | Backend | Henrique's data preserved, second profile creatable |
| 2 | Parent dashboard v0 — weekly summary view (read-only) | Frontend | Renders mock data correctly |
| 3 | LGPD privacy policy + ToS + refund policy (legal review) | PM + lawyer | Reviewed by Giovanni's lawyer, published |
| 3 | Per-user token budget enforcement, R$ 25/month hard cap | Backend | Load test: simulated 200-message burst caps correctly |
| 4 | End-to-end paid signup flow live in staging | All | Giovanni's spouse signs up a fake second kid with real card → paid → cancels → refunded |

**Month 1 exit gate:** A parent who has never seen the product can land on `mamaemeajuda.joowesports.com`, sign up, pay R$ 39, create a child profile, and the child can chat — *without Giovanni intervening*.

### Month 2 (Jun 15 – Jul 14) — Closed Beta with 10 Paying Families

**Theme:** Sell. Learn. Don't build new features unless the first 10 customers say the same thing twice.

| Week | Deliverable | Owner | Success Gate |
|------|------------|-------|--------------|
| 5 | Recruit 10 beta families via Giovanni's network + 2 micro-influencer trial deals | PM | 10 active trials started |
| 5 | Daily check-in cadence: 5-min WhatsApp message to each parent | PM | 100% response rate week 1 |
| 6 | First trial → paid conversions tracked; identify drop-off points | PM | Funnel doc with bottleneck identified |
| 6 | Iterate on parent dashboard based on beta feedback | Frontend | 2 rounds of changes shipped |
| 7 | Referral mechanic live | Backend + Frontend | 3 referrals attempted by week 8 |
| 8 | Cohort retention analysis at day 14 — 60%+ still active = green light open launch | PM | Decision: launch or pivot |

**Month 2 exit gate:** 10 paying families, ≥60% still active at day 14, NPS ≥ 30 from parents.

### Month 3 (Jul 15 – Aug 14) — Open Launch

**Theme:** Scale the working channel. Kill the others. Add family plan if solo works.

| Week | Deliverable | Owner | Success Gate |
|------|------------|-------|--------------|
| 9 | Open signup — remove waitlist gating | PM | Public landing live |
| 9 | First 3 paid Instagram micro-influencer campaigns | Marketing | CAC measurable |
| 10 | Family plan (R$ 59, multi-child) shipped | All | First family-plan upgrade |
| 10 | First 4 SEO articles published | Marketing | Indexed in Google |
| 11 | Cost dashboard live (per-user AI spend, blended margin, cohort LTV/CAC) | PM | Weekly review meeting |
| 12 | 90-day retrospective + plan for Q4 | PM | Doc shared with Giovanni |

**Month 3 exit gate:** 50–100 paying families, CAC < R$ 100, gross margin > 65%, day-30 retention > 50%.

---

## 7. Risks — What Kills This

Listed in descending order of "could end the company."

### Risk 1 — Liability for AI giving bad advice on kids' homework (HIGH × HIGH)

A 12-year-old asks "how do I deal with [self-harm topic]". Moderation misses it. AI responds clumsily. Parent screenshots, posts on Instagram, story goes viral.

**Mitigation already in place:** OpenAI moderation API on input + output, kid-friendly fallback messages, conservative system prompt.
**Mitigation to add:**
- Crisis-detection prompt layer (CVV phone number injected if any self-harm/abuse/family violence signal)
- Quarterly red-team exercise — pay 3 people to try to break the moderation
- ToS explicit: "This is not a substitute for professional mental health support"
- Crisis incident response runbook (who Giovanni calls, what we tell the press, what we say to the parent in the first 60 minutes)

### Risk 2 — AI cost spike kills unit economics (HIGH × MEDIUM)

OpenAI or Google raises prices 2–3x. Or a power user generates R$ 200 of tokens in one exam week. Margin goes from 74% to negative overnight.

**Mitigation:**
- Per-user hard cap (already in MVP scope §4)
- Default to Gemini Flash (cheaper) with GPT-5.1 only on Modo Prova/Estudo where pedagogical lift justifies it
- Quarterly cost review; if blended cost > R$ 14/active user, raise price to R$ 49 or cap features
- Pre-negotiate Google enterprise tier once at 500 active users (15–25% discount)

### Risk 3 — Churn after one exam cycle (HIGH × HIGH)

Parent signs up before AV2. Kid uses it. Exam week ends. Parent cancels. We retain only families with continuous study habits — maybe 30% of signups.

**Mitigation:**
- Annual plan at 25% discount captures the next two exam cycles before the cancel decision
- Build a *summer mode* (after-school enrichment, not exam prep) — keeps the kid engaged in months without exams
- Onboarding sets the expectation: "This works best as a year-round companion, not a crash course"
- Track day-90 retention as the make-or-break metric, not day-30

### Risk 4 — Kid finds it cringe within two sessions (MEDIUM × HIGH)

Henrique is the persona reference. Sandbox theme works for him. Will it work for a 14-year-old girl in São Paulo who plays Among Us and watches BR-K-pop? Possibly not.

**Mitigation:**
- Cosmetic theme variants in v1.1 (sandbox, magical-realism, sci-fi) chosen at signup
- Skip the gamification onboarding for kids who opt out (some teens hate XP/ranks)
- Track session count by persona segment; if any segment churns at 2x baseline, ship a variant

### Risk 5 — LGPD complaint from a parent or ANPD inquiry (MEDIUM × HIGH)

A 12-year-old's data is sensitive. One badly-worded support response or one data leak triggers an ANPD process that consumes 6 months of Giovanni's life.

**Mitigation:**
- LGPD lawyer review of privacy policy, ToS, parental consent flow (month 1, non-negotiable)
- Data minimization — store the kid's conversations but never the kid's full name, never their school's name
- DPA with every subprocessor (Google, OpenAI, Supabase, Vercel) — they all publish them, get them signed
- Right-to-erase button in parent dashboard

### Risk 6 — Native mobile is demanded by App Store / parents (LOW × MEDIUM)

Parents trained by every other app expect an icon in the store. PWAs are real but unfamiliar.

**Mitigation:**
- PWA install prompts at first session + day 3 (already partially built)
- TWA wrapper for Android Play Store (week of work, not month) — same web app, store presence
- iOS App Store native wrapper deferred to Q4 unless conversion data shows the missing icon kills signups (which it won't if landing page CTA is "Comece grátis pelo navegador")

---

## 8. Top 5 Decision Points for Giovanni — This Week

Each of these blocks something downstream. Give a binary answer plus a sentence of reasoning. We can revisit at the 90-day review.

### Q1 — Pricing: R$ 39/month + R$ 349/year, or higher?

**My recommendation: yes, R$ 39 + R$ 349.**
**Why I'm asking:** You may have stronger conviction on price ceiling for the BR middle class. If you believe R$ 49 or R$ 59 works, we adjust unit economics and accept lower volume. Don't go below R$ 29 — destroys margin and signals low quality.

### Q2 — Free trial: card-upfront or no-card?

**My recommendation: no-card 7-day trial for the first 90 days, switch to card-upfront if abuse becomes material.**
**Why I'm asking:** Card-upfront triples conversion at the cost of halving signups. For our stage (need signal, not volume of paid users), more trials = more learning. You may prefer the cleaner unit economics of card-upfront.

### Q3 — Spouse / co-founder involvement for parent perspective?

**My recommendation: dedicate 2 hours/week of a real BR mom (your spouse or a paid advisor) to review every parent-facing flow before we ship.**
**Why I'm asking:** You and I cannot reliably judge parent UX. The dashboard, refund flow, support tone, onboarding email — these need an actual parent's eyes. Without this we will ship something that *we* think is good and *they* think is "meh."

### Q4 — Beta cohort source: your network only, or paid acquisition from day 1?

**My recommendation: your network for the first 10 families (free, fast, biased but high-trust feedback).**
**Why I'm asking:** Network betas give warmer feedback but biased data. Paid acquisition from day 1 gives unbiased data but burns cash before we know the product converts. I'd take the bias for speed; you may disagree.

### Q5 — Cost cap: R$ 25/user/month hard cap — accept or push higher?

**My recommendation: R$ 25 hard cap, with a soft warning to the parent at R$ 20 ("seu filho estudou muito esta semana!").**
**Why I'm asking:** A heavier cap (e.g., R$ 40) lets power users do more but eats margin. The right answer depends on whether you'd rather optimize for delighted heavy users or stable unit economics. I picked stability.

---

## Appendix — What I'd Read Before the Next Decision Meeting

- Supabase auth + RLS patterns for parent/child relationships
- Mercado Pago vs Stripe BR comparison for subscription + PIX
- LGPD Resolution CD/ANPD 4/2024 (treatment of children's data, specifically the consent waterfall)
- 2 reference products: Toca Life World (kids' UX patterns) and Headspace (parent-trust UX patterns)
- Khanmigo's pricing page (their global benchmark we're undercutting)

---

**Status this doc:** Draft v0.1. Not approved. Decisions in §8 unlock month-1 sprint planning. Without those answers, engineering is blocked on auth/payment scope.
