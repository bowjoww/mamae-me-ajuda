# Mobile Scoping — Android + iOS Path for Mamãe Me Ajuda

**Status**: Draft v0.1 — for Giovanni's review
**Author**: Mobile App Builder (delegated by Alex/PM)
**Date**: 2026-05-15
**Decision window**: 5 days
**Companion to**: [`roadmap.md`](./roadmap.md) §4 (MVP scope), §8 (open questions)

---

## TL;DR — the only paragraph that matters

The Board asked "talvez levar pra Android e iPhone". The honest answer: **we already are on Android and iPhone — the PWA installs from Safari/Chrome today.** What's missing is store-distributed apps. Three paths exist. **Recommendation: ship a polished PWA this week (cost: 1 dev-week), then wrap it in Capacitor for Play Store + App Store in v1.1 (cost: 2–3 dev-weeks).** A React Native rewrite is a 4–6 month detour that delays paid-user validation. The real bottleneck isn't the runtime — it's iOS push notifications and the App Store "minimum functionality" rule for kids apps, both of which Capacitor solves but PWA-on-iOS does not. Cost order: PWA polish (R$ 5–10k) < Capacitor wrap (R$ 25–40k) << RN rewrite (R$ 150k+).

---

## 1. Recommendation — Hybrid Path

> **Phase 1 (this week): PWA polish.** Get the home-screen install slick. Fix the iOS install gaps. Validate the first 10 paying families on PWA distribution.
>
> **Phase 2 (after 10 paying families, ~month 2): Capacitor wrap.** Same Next.js codebase, one binary per store, native push notifications working. Submit to Play Store first (easier review), TestFlight + App Store second.
>
> **Phase 3 (only if engagement data demands it): selective native modules.** Maybe a native OCR scanner for textbook pages, maybe richer audio playback. Stay inside Capacitor — don't fork the UI codebase.
>
> **Reject React Native rewrite for v1.x.** The UI is too young to freeze, the team is too small, and the AI chat experience (SSE streaming, markdown rendering, audio playback) maps cleanly to a webview but painfully to RN primitives.

### Why this order

1. **Cost of being wrong is asymmetric.** A PWA shipped this week costs R$ 5–10k and can be killed in a day. A native rewrite costs R$ 150k+ and locks the team into a stack for 18 months. We have one paying user (Henrique, who isn't paying yet). Anything that defers the first paid signup is malpractice.
2. **Apple's "Kids" category rules are the highest-risk path.** TestFlight + App Store review for a kids EdTech app with AI chat is a 2–6 week minefield (LGPD-equivalent data handling, COPPA self-cert, no third-party ad SDKs, no behavioral analytics on under-13s). We want that review submitted with a working revenue product, not a half-built one.
3. **The "real" mobile features are push + offline + camera, in that order.** Of those, push is the only one PWA can't do well on iOS as of iOS 18. Capacitor fixes that without rebuilding anything.
4. **Single codebase is non-negotiable at our stage.** Two-person team (Giovanni + Henrique-as-tester), one product, two stores. Maintenance of a split RN/Web codebase would consume 30–40% of dev time forever. That budget belongs to acquisition, not platform plumbing.

### Sequenced cost & timeline

| Phase | Calendar Time | Dev Effort | Cash Cost (incl. dev rates) | First Install in Store |
|-------|---------------|------------|------------------------------|------------------------|
| PWA polish | Week 1 | 30–40 hours | R$ 5–10k | N/A — install via browser |
| Capacitor wrap (Android first) | Weeks 5–7 | 60–80 hours | R$ 18–30k | Play Store: ~week 7 |
| Capacitor wrap (iOS / App Store) | Weeks 7–10 | 40–60 hours + review wait | R$ 15–25k | App Store: ~week 10–12 |
| **Total Phase 1+2** | **~10 weeks** | **130–180 hours** | **R$ 38–65k** | **Both stores by month 3** |
| RN rewrite (rejected alternative) | 16–24 weeks | 600+ hours | R$ 150–250k | ~month 6 |

---

## 2. PWA Path — What to Ship This Week

### Current state audit

What already works:
- `public/manifest.json` — valid, has icons (192/512), screenshots, categories `["education", "kids"]`, theme color, `display: standalone`, scope, start_url. **This is production-grade.**
- `public/sw.js` — versioned (`v2-2026-04-21`), correct cache strategy per route type, offline fallback to `/offline`. Never-cache list is right (chat, TTS, auth).
- `src/app/layout.tsx` — `appleWebApp.capable: true`, `statusBarStyle: black-translucent`, `apple-touch-icon` linked, viewport `viewportFit: cover` (safe-area aware), `userScalable: true` (WCAG 2.2 compliant).
- `next.config.ts` — strict security headers (HSTS, X-Frame-Options DENY, etc.).
- `src/middleware.ts` — CSP includes `worker-src 'self'` (SW won't be blocked).
- `src/app/components/ChatInput.tsx` — `<input type="file" accept="image/*" capture="environment">` — **camera capture for textbook OCR already wired** via HTML standard. No native code needed.

### Gaps to close this week

| Priority | Gap | Effort | Why it matters |
|----------|-----|--------|----------------|
| P0 | **iOS install prompt** — Safari on iOS does NOT auto-prompt for "Add to Home Screen". Most parents won't discover it. | 2h | Without a prompt, install rate stays near 0% on iOS. Add a one-time inline banner that detects iOS Safari, shows "Toque em ↑ depois 'Adicionar à Tela de Início'" with a tiny screenshot. |
| P0 | **iOS standalone session loss** — when launched from home screen on iOS < 17, Safari and the PWA used separate cookie jars. Test that Supabase auth survives the home-screen launch. | 3h | If login breaks after install, churn = 100%. |
| P0 | **Android install prompt (`beforeinstallprompt`)** — currently nothing listens for it. Chrome will silently fire it and we drop it. | 2h | Capture the event, defer it, show our own styled CTA after the kid sends 3 messages (high intent moment). |
| P1 | **Apple touch icon variants** — only one 180x180 shipped. Add 152x152 (iPad), 167x167 (iPad Pro), splash images for iOS. | 3h | Without splash images, iOS shows white flash on launch — feels broken. |
| P1 | **Maskable icon QA** — `purpose: "any maskable"` is declared on 512. Verify with Maskable.app that the safe zone is respected. | 1h | Some Android launchers crop the icon badly today if the safe zone is wrong. |
| P1 | **`prefer_related_applications: false`** — already correct. Once we ship a Capacitor build, flip to `true` and add to `related_applications` so the Play Store install banner takes over. | 0h now, 1h later | Cosmetic. |
| P2 | **Push subscription endpoint** — no service-worker push handler exists yet. Web Push is the only PWA push that works on iOS, and only via Safari since iOS 16.4 and only after the user installs to home screen. | 8h | See §5 — pre-wire VAPID even if we don't send pushes day one. |
| P2 | **Offline page polish** — `/offline` exists; should at minimum show last 3 conversations from IndexedDB (so a kid stuck in the elevator can re-read the last explanation). | 6h | Differentiation from ChatGPT-tab-in-Safari. |
| P3 | **PWA-only feature gating** — when running standalone (`window.matchMedia('(display-mode: standalone)').matches`), unlock subtle perks: floating mic button, larger touch targets, optional `display-override: window-controls-overlay`. Reinforces the "this is an app" feel. | 4h | Reduces the "this is just a website" perception that hurts conversion. |

**Total this-week effort: ~29 hours = one focused dev-week for Giovanni or a contractor.**

### What PWA can NOT do (and why it's OK for Phase 1)

| Capability | iOS PWA Status | Android PWA Status | Mitigation |
|------------|----------------|--------------------|------------|
| Push notifications | Works only after home-screen install + iOS 16.4+ + user grants permission. Buggy delivery. No badge counts on app icon. | Works via Web Push API. Reliable. | Phase 1: don't depend on push. Use email + WhatsApp for streak reminders. |
| Camera (still photo) | `<input type="file" capture>` works in Safari since iOS 6. | Works since forever. | **Already wired.** Sufficient for OCR of textbook pages. |
| Microphone (Web Speech API) | Limited — Safari supports it but quirky in standalone mode. | Works in Chrome. | Phase 1: skip voice input. Type-only is fine for v1.0. |
| File picker | Works. | Works. | No gap. |
| Offline cache | Service worker + IndexedDB. Up to ~50MB on iOS, larger on Android. | Larger budget. | Sufficient for last 30 days of chats. |
| Store distribution | **Cannot list in App Store / Play Store.** | Play Store accepts PWAs via Trusted Web Activity (TWA) — see Phase 2. | Phase 1 distribution is word-of-mouth + WhatsApp links. Acceptable while we validate ICP. |
| In-app purchases | Cannot. Must use Stripe/Pix web checkout. | Cannot via PWA. | For our pricing motion (R$ 39/mo subscription billed via Pix/Stripe), this is actually a feature: we avoid the 30% Apple/Google tax for now. See §6 — once we list on App Store, Apple may force IAP. |
| Background sync | Not on iOS. Limited on Android. | Limited. | Don't depend on it. |
| Biometric auth (Face ID / fingerprint) | WebAuthn works in Safari since iOS 14. | WebAuthn works in Chrome since Android 7. | Wire WebAuthn for parent dashboard logins later. |

### Definition of done — Phase 1 PWA

- [ ] Install rate on iOS measurable in PostHog (event: `pwa_install_shown`, `pwa_install_accepted`)
- [ ] Install rate on Android measurable
- [ ] Home-screen launch preserves Supabase session (no re-login)
- [ ] Splash image shows correctly on iOS (no white flash)
- [ ] Maskable icon renders correctly on Android (Pixel default launcher + One UI)
- [ ] Offline page shows last conversation when network drops mid-chat
- [ ] Lighthouse PWA score ≥ 95
- [ ] Camera capture button works on iOS Safari + Android Chrome (validated against a real textbook page)

---

## 3. Capacitor Path — Phase 2 Setup Checklist

Capacitor (from Ionic team) wraps the existing Next.js app in a native WebView, gives us native plugins for push/camera/biometric/IAP, and produces an `.aab` (Android) + `.ipa` (iOS) ready for store submission. **Same TypeScript codebase as today — no UI rewrite.**

### Why Capacitor over the alternatives

| Wrapper | Verdict | Reason |
|---------|---------|--------|
| **Capacitor 6+** | ✅ Pick this | Modern, actively maintained by Ionic. First-class Next.js static export support. Plugin ecosystem mature. Push, IAP, camera, biometric all available. |
| **Cordova / PhoneGap** | ❌ Reject | Adobe killed PhoneGap. Cordova still alive but stagnant. Capacitor was built specifically to replace it. |
| **Trusted Web Activity (TWA, Android-only)** | 🤔 Consider for Android-only fallback | Bubblewrap from Chrome team. Wraps the live PWA URL in an APK. Zero code change. **Only works on Android. App Store rejects equivalent (WebClip) submissions.** Use only if Capacitor setup blocks. |
| **React Native WebView wrapping the PWA** | ❌ Reject | Worst of both worlds — RN overhead with no RN benefit. |

### Pre-conditions (must verify before starting)

1. **Next.js builds to static export OR runs in an in-app HTTP server.** Our current setup uses Next 16 server features (API routes, middleware, SSR). The API routes can stay on Vercel — the wrapper hits them over HTTPS like a browser would. The UI bundle just needs `output: 'export'` or we run `next start` inside a local Node binary (Capacitor doesn't support that — use static export with rewrites to Vercel for `/api/*`).
2. **CSP allows `capacitor://` and `https://localhost` origins.** Current CSP in `src/middleware.ts` is `connect-src 'self' ${supabaseSrc} ...`. Capacitor WebView origin is `capacitor://localhost` (iOS) and `https://localhost` (Android) — middleware will not run for in-app navigation, but API calls TO our server will. Update CSP `connect-src` to add the Vercel production origin explicitly.
3. **Service worker behavior in WebView.** Capacitor WebView supports SW on Android but **NOT on iOS WKWebView before iOS 16.4**. Translation: our cache strategy needs a fallback. Use Capacitor's `@capacitor/preferences` and `@capacitor/filesystem` for offline storage on iOS.
4. **All assets must be relative.** Current Next config uses absolute origins for some Sentry/PostHog calls. Audit `next.config.ts` for any `basePath` or absolute asset URLs.

### Dependencies to add

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios
npm install @capacitor/push-notifications @capacitor/camera
npm install @capacitor/preferences @capacitor/filesystem
npm install @capacitor/app @capacitor/haptics @capacitor/status-bar
npm install @capacitor/splash-screen
npm install @revenuecat/purchases-capacitor  # IAP — only if forced by App Store
```

### Files to create

- `capacitor.config.ts` — appId `com.mamaemeajuda.app`, appName, webDir pointing to `out/` (Next static export) or `.next/standalone/`, server URL config.
- `ios/App/` — Xcode project (generated by `npx cap add ios`).
- `android/` — Android Studio project (generated by `npx cap add android`).
- `src/app/components/CapacitorBridge.tsx` — client-only component that initializes Capacitor plugins (push registration, status bar style, splash hide).
- `src/lib/capacitor/isNative.ts` — feature detection helper to branch UI for native vs web.
- `src/lib/capacitor/push.ts` — wraps FCM (Android) + APNs (iOS) registration, posts the device token to our `/api/devices` endpoint.

### Build config changes

```typescript
// next.config.ts additions
const nextConfig: NextConfig = {
  output: 'export',           // static export for Capacitor
  images: { unoptimized: true }, // next/image can't run in WebView without a server
  trailingSlash: true,        // Capacitor file serving prefers /index.html paths
  assetPrefix: process.env.CAPACITOR_BUILD ? '' : undefined,
};
```

### What changes vs PWA

| Concern | PWA Today | Capacitor Build |
|---------|-----------|-----------------|
| Routing | Next.js server-side | Static export, client-side routing only |
| API calls | Same-origin to our server | Cross-origin to `mamaemeajuda.com.br` — CORS headers needed on every route |
| Auth | Supabase cookie-based | Supabase token-based (move to `@supabase/supabase-js` with persistent storage via `@capacitor/preferences`) |
| Push | Web Push (limited iOS) | Native FCM + APNs via `@capacitor/push-notifications` |
| Camera | `<input capture>` | Optionally `@capacitor/camera` for richer UX (crop, retake) |
| TTS audio | `fetch /api/tts` → `Audio` element | Same, plus `@capacitor/haptics` for tactile feedback on send |
| Sentry | `@sentry/nextjs` | Switch to `@sentry/capacitor` SDK for native crash capture |
| PostHog | `posthog-js` | Works as-is, but add native session continuity |

### Distribution checklist — Play Store

1. Generate signing keystore (`keytool -genkey -v -keystore mamae-release-key.jks ...`).
2. Build release AAB: `cd android && ./gradlew bundleRelease`.
3. Google Play Console account (R$ 125 one-time fee for individual or R$ 0 for org if registered).
4. Data Safety form — declare all data collected, mapped to LGPD bases (we collect: name, conversation content, optional age, optional school). Be honest about AI processing.
5. Content rating questionnaire — "PEGI 3" expected (no violence, no chat with strangers, AI-mediated only).
6. **Target audience**: choose "13 and older" to **avoid Google's Designed for Families program** in v1.0. Families program requires no behavioral ads, restricted SDKs, and slower review. If parents buy and 11–12yo kids use it, the parent account is the legal user.
7. Privacy policy URL (we have `/privacidade` route).
8. Account deletion URL — Google now requires an in-app and web-accessible account deletion flow. Wire `/api/account/export` already exists; add `/api/account/delete` and a UI in `/perfil`.
9. Screenshots — already have `screenshots/tela-inicial.png`, `screenshots/conversa.png` at 390x844. Need 1080x1920 phone + tablet sizes for the listing.
10. Beta track first: internal testing → closed beta (Henrique + 5 friends) → open beta → production. Expect 2–3 business days per stage.

### Distribution checklist — App Store

1. Apple Developer Program enrollment — US$ 99/year. **Critical: must be enrolled as individual under Giovanni's name OR as a legal entity (LLC). Personal credit card OK; CPF works for Brazil enrollment.** Enrollment takes 1–7 business days.
2. Create App ID in Apple Developer Portal: `com.mamaemeajuda.app`, enable Push Notifications + In-App Purchase capabilities.
3. Generate APNs key (`.p8`) for push notifications. Upload to our backend.
4. App Store Connect listing — Brazilian Portuguese primary, also fill English-US for review-team readability.
5. Privacy nutrition label — declare data collected (Email Address, User Content, Identifiers, Diagnostics). Mark all as "Linked to Identity" since we associate with the user account.
6. Age rating questionnaire — expect **4+** if we mark "no objectionable content" honestly. **Do not opt into the "Kids" category in v1.0** — it triggers stricter review (no analytics, no third-party SDKs incl. PostHog/Sentry, requires CMS-managed content). See §6.
7. Privacy policy URL (mandatory) — `/privacidade`.
8. **Demo account** for review team — create `revisor@mamaemeajuda.com.br` with sample student profile, no Pix activation required.
9. App Store review notes — explain: AI chat is moderated (OpenAI moderation API on input + output), no user-to-user chat, no UGC visible to other users, no third-party logins beyond Google OAuth.
10. TestFlight — internal review first (3 testers), then external beta (up to 10k testers, 90-day expiry per build).
11. **First submission almost always rejected** — Apple's review team flags AI apps for: (a) inability to filter objectionable content, (b) data collection from minors. Have a written response template ready citing our moderation pipeline.

### Estimated review timelines

| Store | First submission | Update submissions |
|-------|------------------|---------------------|
| Google Play | 3–7 days | 1–2 days |
| Apple App Store | 1–4 weeks (often a rejection cycle) | 1–3 days |

---

## 4. React Native Rewrite — Why We're Saying No

Documented so the option is on the record, not because we'd take it.

### What an RN rewrite would look like

- **Stack**: Expo SDK 51+ (managed workflow), Expo Router (file-based, mirrors Next App Router), `expo-router` for navigation, NativeWind for Tailwind-like styling, `@supabase/supabase-js` (works in RN with AsyncStorage), `@react-native-firebase/messaging` for push, `expo-camera` for camera, `expo-speech` for TTS or Audio API for OpenAI TTS playback.
- **Shared code**: Pure TS — schemas (zod), API client, types, business logic in `/lib`. Can extract to a workspace.
- **NOT shared**: Every component in `src/app/components/`. Every route in `src/app/`. CSS. Service worker. Middleware. Service-side parts (those stay as Next API routes deployed on Vercel).
- **Web sibling option**: `react-native-web` to preserve a web build from the same codebase. Adds significant friction — RN primitives like `<View>`, `<Text>`, `<Pressable>` don't render Tailwind classes natively; needs NativeWind plumbing.

### Effort estimate

| Workstream | Hours | Notes |
|-----------|-------|-------|
| Project setup, CI, EAS Build pipeline | 40 | Expo Application Services for cloud builds |
| Port `WelcomeScreen`, `AppIntroModal`, `ConsentModal` | 30 | Onboarding surfaces |
| Port chat: `MessageList`, `ChatMessage`, `ChatInput`, `TypingIndicator`, `ImagePreviewBar` | 80 | Streaming SSE is non-trivial — RN's `fetch` doesn't expose ReadableStream natively; need `react-native-sse` or `eventsource` polyfill |
| Port markdown rendering (replace `react-markdown` with `react-native-markdown-display`) | 40 | Markdown styling diverges; math equation rendering may need WebView fallback |
| Port HUD components: `XpBar`, `TierBadge`, `PowerUpChip`, `QuestCard`, etc. | 80 | A lot of Tailwind to NativeWind translation |
| Port `prova`, `estudo`, `perfil` routes | 100 | Modo Prova, Modo Estudo, profile |
| Audio playback (TTS) | 20 | `expo-av` or `react-native-track-player` |
| Push notifications + deep linking | 40 | FCM + APNs setup, notification handling, navigation from notification |
| Camera + image upload | 30 | `expo-camera` or `expo-image-picker` |
| Auth + session management | 30 | Supabase with AsyncStorage adapter |
| Offline / IndexedDB equivalent | 40 | `expo-sqlite` or MMKV |
| Testing rewrite (Jest works, Playwright doesn't — switch E2E to Detox or Maestro) | 80 | Lose existing Playwright suite |
| Store submission | 40 | Same as Capacitor |
| **Total** | **650 hours** | **~4 months full-time for one senior dev** |

### Why it's the wrong call now

- The current product hasn't proven product-market fit. Rewriting before validation is a textbook anti-pattern.
- AI streaming chat is genuinely harder in RN (SSE polyfills, no native `EventSource`).
- We lose Playwright E2E coverage that's already validating critical flows.
- The team is one developer (Giovanni). 4 months of platform work = 4 months of no product iteration = competitors catch up.
- The Capacitor path delivers stores in 6–8 weeks vs 16–24 weeks. The marginal native-feel quality is not worth 12 weeks of opportunity cost.

### When to revisit

If by month 12 we have:
- 1000+ paying families
- Clear evidence that WebView is bottlenecking specific UX (e.g., chat scroll FPS < 30 on mid-tier Android)
- Need for features Capacitor can't deliver (heavy AR overlays, complex video editing)

Then RN rewrite becomes a board decision with data. Today it's a vibes decision and the vibes say "no".

---

## 5. Push Notifications Strategy

Push is the **#1 driver of D7/D30 retention in EdTech**. Get this right.

### Use cases for our product

| Notification | Trigger | Time of day | Frequency cap |
|--------------|---------|-------------|----------------|
| **Streak reminder** ("Não esquece da sua streak de 7 dias!") | User hasn't opened the app today, has active streak | 19:00 local time | 1/day |
| **Exam countdown** ("Faltam 3 dias pra prova de matemática. Bora revisar?") | Exam date in `study_plans` table is within 7 days | 18:00 local time | 1/day max |
| **Flashcard due** ("Você tem 12 cards prontos pra revisar") | SRS scheduling shows ≥ 10 cards due | Morning (07:30) or after-school (16:00) | 1/day |
| **Quest complete celebration** | User completed a daily quest | Real-time | No cap |
| **Parent weekly recap** ("Seu filho estudou 4h esta semana — veja o resumo") | Sunday 19:00 | 1/week | Parent-account only |
| **Re-engagement** ("Faz 3 dias que a gente não se vê") | No session in 3 days | Saturday morning | Decay: day 3, day 7, day 14, then stop |

### Anti-patterns to avoid

- ❌ Generic "Volta pra cá!" with no context — gets disabled fast
- ❌ More than 2 notifications/day — kids and parents both turn them off
- ❌ Notifications during school hours (07:00–17:00 weekdays) for the kid persona
- ❌ Marketing pushes (new feature announcements) before D14 — looks spammy
- ❌ Push at 9pm+ for kids under 14 — parent complaints

### Technical strategy

| Phase | Channel | Tech | Implementation effort |
|-------|---------|------|------------------------|
| **Phase 1 (PWA, this week–month 1)** | Web Push (Android + iOS 16.4+) | VAPID keys, `self.registration.pushManager.subscribe()`, store subscription in `device_subscriptions` table | 16h — wire even before we send the first push |
| **Phase 1 (parallel)** | Email | Resend.com or SES, triggered by Supabase Edge Function on cron | 8h |
| **Phase 1 (parallel)** | WhatsApp opt-in | Twilio API or 360dialog — for parent recaps. **Brazilian parents check WhatsApp more than email.** | 24h |
| **Phase 2 (Capacitor)** | Native FCM (Android) + APNs (iOS) via `@capacitor/push-notifications` | Replace VAPID flow with FCM token registration on native, keep VAPID on web | 24h |
| **Backend** | Single send pipeline | One cron job in Vercel Cron or Supabase Edge Function reads `notifications_queue`, fans out to whichever channel matches the user's device tokens | 24h |

### LGPD + opt-in flow

- **Opt-in is mandatory** under LGPD Art. 7º for non-essential processing. Notifications are not essential.
- On first install, defer the system prompt until after a value-positive moment (e.g., kid completes first lesson). Apple's HIG and Google's UX guidelines both back this.
- Granular controls in `/perfil`: separate toggles for streak, exam, flashcard, parent recap.
- Parent dashboard (v1.1) can control which notifications the child receives.

### Cost & limits

- **FCM**: free.
- **APNs**: free.
- **Web Push**: free.
- **WhatsApp**: ~R$ 0.05–0.15 per template message in Brazil; only use for parent recaps (~4 messages/parent/month = R$ 0.20–0.60/parent).
- **Email**: Resend free tier covers 3000/month; beyond that ~R$ 0.005/email.

Total notification cost per active user: < R$ 1/month. Negligible.

---

## 6. Store Policy Minefield — Kids Apps Specifics

### Apple — the harder one

#### Avoid the "Kids" category in v1.0

Section 1.3 + 5.1.4 of App Review Guidelines + the Kids Category guidelines impose:
- **No third-party analytics** (kills PostHog)
- **No third-party advertising** (we don't have ads anyway)
- **No outbound links to anywhere other than App Store, family-friendly content** (kills our `/privacidade` external links if any)
- **No requests for personal info from kids**
- **Parental gate** before any purchase, external link, or sharing functionality
- **Stricter review process** — months not weeks

**Our move**: Mark the app **4+** (works for all ages) but NOT enroll in the Kids Category. The app is bought and managed by parents; kids use it under a parent account. Apple's policy distinguishes "for kids" (Kids Category) from "appropriate for kids" (4+ rating). We want the second.

#### AI app scrutiny (new in 2024–2025)

Apple has been actively rejecting generative-AI chat apps that:
- Don't filter unsafe content (we have OpenAI moderation on input + output — document this)
- Generate inappropriate images (we don't generate images — document this)
- Allow user-to-user chat (we don't — document this)
- Are thin wrappers over ChatGPT without proprietary value (we have AV2 simulator, gamification, study plans — document this)

**Required in review notes**: link to our moderation policy, screenshots of safety guardrails, video walkthrough showing the app refusing inappropriate prompts.

#### In-App Purchase rule

Apple requires IAP for digital subscriptions consumed in the app. **Two paths:**
1. **Add IAP for the R$ 39 subscription.** Lose 30% (15% after year one for subscriptions). Convenient for parents. RevenueCat smooths the multi-platform billing.
2. **No subscription buyable in-app — only via web checkout.** Allowed but you can't link to the web checkout from inside the app (the "reader" rule applies only to specific categories; education isn't one). Subscription must be activated by login after web purchase. This is the "Spotify model".

For v1.0, the **Spotify model** is right: Pix-based web checkout (no 30% loss), parents activate on the web, kid logs in with same email on the app. We lose the impulse-buy moment but preserve unit economics at our R$ 39 price point. Phase 3 (after 200 paying families) reconsider IAP.

### Google — the easier one

#### Avoid the "Designed for Families" program in v1.0

Similar restrictions to Apple's Kids Category. Target audience 13+ in Play Console questionnaire, but app is appropriate for younger users (the parent owns the account).

#### Families Self-Certification (since 2023)

Even without joining the program, all apps with kids in the audience must self-certify compliance with Google Families Policy:
- No location targeting based on kids
- No collection of persistent identifiers without consent
- No personalized ads to under-13s (we don't have ads)
- Real-money transactions need parental gate

We comply by virtue of having a parent-owned account model and no ads.

#### Google Play Data Safety

Must declare in 2025-format:
- "Personal info" (name): collected, shared with no one, optional, used for app functionality
- "User content" (messages, photos uploaded): collected, shared with AI providers (Google/OpenAI for inference), used for app functionality, NOT used to train models — confirm OpenAI zero-retention setting is on
- "App activity" (analytics): collected, shared with PostHog, used for analytics/personalization
- "App info and performance" (crashes): collected, shared with Sentry, used for analytics

### COPPA / LGPD for children

We're a Brazilian product targeting Brazilian users — LGPD is the primary regime, but listing on US app stores exposes us to COPPA secondarily.

#### LGPD for kids — Art. 14º

- Specific consent from parents or legal guardians is required to process data of children under 12.
- Processing must be in the **best interest of the child**.
- Must be able to provide consent withdrawal trivially.

**Our compliance pattern**:
- Onboarding asks parent's email and CPF (or age confirmation), explicit checkbox: "Sou responsável legal pelo(a) menor e autorizo o processamento dos dados conforme a Política de Privacidade".
- Account is in parent's name. Kid profile is a child entity under it.
- Account deletion endpoint deletes all child profiles too (already partially built via `/api/account/export`).
- Privacy policy plain-language version for kids 11–15 (one-pager separate from legal text).

#### COPPA self-cert (if we list on US App Store)

- We won't actively target US kids in v1.0.
- App Store listing: Age rating 4+ but "Made for Kids" = No.
- If asked: we're a Brazilian product, LGPD-compliant, English-US listing exists for App Store reviewers only.

### Account deletion (both stores require this in 2025)

- Web: `/perfil` → "Excluir minha conta" → confirm → 24h grace period → permanent delete.
- API: `POST /api/account/delete` (idempotent).
- Email confirmation of deletion within 7 days.
- Already partially built — `/api/account/export` exists; mirror it for delete.

### Privacy policy specifics

Must explicitly cover:
- Data collected and purposes (LGPD Art. 9º)
- Legal basis for each purpose (consent for analytics, legitimate interest for service operation, etc.)
- Third-party processors (Supabase, Vercel, Google Generative AI, OpenAI, PostHog, Sentry, Upstash)
- International transfer of data (most of these are US-hosted — declare ANPD standard contractual clauses)
- DPO contact (`privacidade@mamaemeajuda.com.br`)
- Data subject rights (access, deletion, portability, correction)
- Retention periods (conversations: 90 days default, configurable)
- Kid-specific section (Art. 14º LGPD)

Current `/privacidade` route exists per the file glob — audit it against this list before submission.

---

## 7. AI Chat Experience — Implications

The chat is the product. Anything that hurts the chat experience kills the app.

### Streaming SSE in each environment

| Environment | SSE Support | Implementation Effort | Quality Risk |
|-------------|-------------|------------------------|---------------|
| Web (current) | Native `fetch` + `ReadableStream`. Works. | 0 (already shipped) | None |
| PWA (same as web) | Same | 0 | None |
| Capacitor WebView (Android) | Works — WebView inherits Chrome's fetch streaming | 0 | Low |
| Capacitor WebView (iOS WKWebView) | **Caveat**: WKWebView 16+ supports fetch streaming. iOS 15 has bugs. Our min-iOS should be 16.4 (which we'd already need for push). | 2h to verify | Low if min-iOS 16.4 |
| React Native | **Not native.** Need `react-native-sse` package or polyfill. Token-by-token streaming gets choppy on Android due to JS thread bridge. | 16h | Medium — first-time setup is real, edge cases (network drop mid-stream) need careful handling |

This alone is a strong argument for Capacitor over RN. The streaming chat works *today* in a WebView.

### Audio TTS playback

Current flow: `POST /api/tts` returns audio binary, frontend creates Blob URL, plays via `<audio>` element.

| Environment | Behavior | Notes |
|-------------|----------|-------|
| PWA | Works. | Some iOS quirks with `<audio>` requiring a user gesture for first play — already handled in our UI. |
| Capacitor | Works in WebView. Optionally use `@capacitor/preferences` to cache TTS responses for offline replay. | Adds nice-to-have caching. |
| RN | Switch to `expo-av` Audio API. Different lifecycle, need to manage focus, interruptions (calls), background audio. | Real engineering effort. |

### Markdown rendering

Current: `react-markdown` + `remark-gfm`.

| Environment | Behavior | Notes |
|-------------|----------|-------|
| PWA / Capacitor | Same as web. | Math, code, lists, tables all just work. |
| RN | Replace with `react-native-markdown-display` or render to a `WebView` per message. | Math equation rendering becomes painful; tables lose features. |

### Image upload for textbook OCR

Already wired via `<input type="file" capture="environment">` in `ChatInput.tsx`.

| Environment | Capability | Notes |
|-------------|------------|-------|
| PWA | Works on iOS Safari + Android Chrome. | Sufficient. |
| Capacitor | Either use the existing HTML `input` (works in WebView) or upgrade to `@capacitor/camera` for cropping, retake, batch capture, native permission dialogs. | Phase 2 nice-to-have. The HTML path works on day 1. |
| RN | `expo-image-picker` or `expo-camera`. Permissions handled natively. | Required rewrite if going RN. |

### Microphone / voice input

Not yet wired. Roadmap eventual feature.

| Environment | Path | Notes |
|-------------|------|-------|
| PWA | Web Speech API for STT, or record + send to OpenAI Whisper API. Works on Android Chrome, quirky on iOS Safari. | Acceptable for v1.0. |
| Capacitor | Same Web Speech API in WebView, or `@capacitor-community/speech-recognition` plugin for native quality. | Phase 3. |
| RN | `expo-av` recording + Whisper API, or `react-native-voice` for on-device. | Phase 3. |

### Performance budget

PWA WebView performance is generally fine for our chat-centric product. Watchpoints:
- Long chat scrollback (200+ messages): virtualize. Already on the list per the gamification debt.
- HUD animations: ensure all use `transform`/`opacity`, no `width`/`height` animations.
- Audio playback during scroll: confirm no jank — we use `<audio>` not WebAudio so should be fine.

---

## 8. Top 3 Decisions to Unblock the Call

### Decision 1 — Confirm sequenced strategy (PWA polish now, Capacitor later)

> **The ask**: Approve spending 1 dev-week this week on PWA polish and **postpone** the store-distribution decision until we have 10 paying families on the PWA.

**Why it matters**: If we approve the full Capacitor wrap today, we burn 6–10 weeks of dev time before validating that anyone pays. If we approve only PWA polish, we keep the option open and learn first.

**Default if no decision**: Do the PWA polish anyway — it's reversible, cheap, and helps every channel.

### Decision 2 — Pick the legal entity for store enrollment

> **The ask**: Does Giovanni enroll Apple Developer + Google Play under his personal CPF, or do we register an LLC (Sociedade Limitada or MEI) first?

**Why it matters**:
- Personal enrollment is faster (~1 week) and cheaper (US$ 99 Apple + R$ 125 Google) but legally exposes Giovanni personally. Crucially, **App Store transfers from individual to business entity later are painful** — Apple will not transfer accounts in many cases, requiring a brand-new listing and losing all reviews/ratings.
- MEI registration takes 2 weeks and ~R$ 100. Limits revenue to R$ 81k/year but we're nowhere near that. Easy upgrade path to LTDA.
- LTDA / Sociedade Limitada takes 4–8 weeks, costs R$ 1500–3000 setup, but is the right structure if we're serious about taking outside money or going to the families segment.

**Default if no decision**: Enroll personally to unblock; plan migration to LTDA before month 12.

### Decision 3 — IAP vs Spotify model for subscription

> **The ask**: When we ship to App Store, do we (a) implement Apple IAP and absorb the 30% / 15% commission, or (b) Spotify-model (web-only checkout, login activation in-app, no in-app upgrade flow)?

**Why it matters**:
- IAP at R$ 39: Apple takes R$ 11.70 first year, R$ 5.85 after. Margin drops from 74% to 44% in year 1.
- Spotify model preserves margin but adds a friction step (parent goes to mamaemeajuda.com.br/assinar to pay) and Apple specifically forbids linking to the web from inside the app for some categories. Education isn't one of those categories, so we technically can include a button. But Apple sometimes rejects this on review and asks us to remove the link.
- Spotify model + a banner that says "Faça login se já é assinante" works in practice.

**Default if no decision**: Spotify model for v1.0. Add IAP in v1.1 if and only if review feedback or Phase 3 metrics demand it.

---

## Appendix A — Reference Files Audited

| File | Role | Verdict |
|------|------|---------|
| `package.json` | Dependency list | Production-grade. No mobile dependencies yet. Adding Capacitor adds ~150MB to `node_modules` but no runtime cost. |
| `public/manifest.json` | PWA manifest | Production-grade. Icons, screenshots, categories all set. |
| `public/sw.js` | Service worker | Production-grade. Versioned, correct strategies, sensible never-cache list. |
| `next.config.ts` | Next config + Sentry | Strict security headers. Will need `output: 'export'` for Capacitor static build. |
| `src/app/layout.tsx` | Root layout + PWA meta | Production-grade. Apple touch icon, theme color, viewport-fit cover, user-scalable. |
| `src/middleware.ts` | CSP + auth gate | Good. CSP needs `connect-src` update when wrapping for Capacitor. |
| `src/app/components/ChatInput.tsx` | Chat input incl. camera | Camera capture wired via HTML standard. Works in PWA today. |
| `src/app/api/chat/route.ts` | AI chat SSE | Streams from Gemini/OpenAI. Works in WebView. No native code required. |
| `src/app/api/tts/route.ts` | OpenAI TTS proxy | Returns audio binary. Works in WebView. |

## Appendix B — What I Didn't Audit (Risks)

- **Sentry SDK behavior in Capacitor WebView** — `@sentry/nextjs` may not capture native crashes; `@sentry/capacitor` is the right SDK and adds ~200kb.
- **Supabase Realtime over WebSocket inside Capacitor** — should work (wss://), but iOS WKWebView WebSocket handling has historical quirks. Validate before submission.
- **OpenAI moderation API rate limits** — if we 10x traffic post-store-launch, may hit quota.
- **Vercel function cold starts** from a mobile network when waking the app — may cause first-message delay of 2–3 seconds. Consider Edge Runtime for hot paths.

## Appendix C — Sources & Conventions Used

- Apple App Store Review Guidelines, latest revision 2025-Q1
- Google Play Console Families Policy, 2024 update
- LGPD Art. 14º (children's data) + ANPD guidelines on app-based processing
- Capacitor 6 official docs (note: when implementing, use Context7 MCP to pull current API references — Capacitor moves fast)
- Next.js 16 static export limitations as of 2026-04 release notes

---

**Next step**: Giovanni reviews this doc + `roadmap.md` together this week, makes the three calls in §8, and the team executes Phase 1 PWA polish immediately regardless of the Phase 2 outcome.
