# Accessibility Audit Report

**Product**: Mamãe, me ajuda! — EdTech chat/study PWA
**Audience**: 12-year-old user (Henrique) + Brazilian parents (LGPD-regulated)
**Standard**: WCAG 2.2 Level AA
**Date**: 2026-05-15
**Auditor**: AccessibilityAuditor (static analysis pass)
**Scope**: `/`, `/chat`, `/prova`, `/estudo`, `/perfil`, `/auth/callback`, all HUD components, navigation, modals, color tokens

> **Methodology caveat**: This audit is **static-only**. Real browser, real screen reader (VoiceOver/NVDA/TalkBack), and real device testing are still needed to confirm 7 of the findings below (marked `[NEEDS LIVE TEST]`). OKLCH contrast ratios were computed from the OKLab → linear sRGB → relative luminance pipeline; cross-check on real Android panels recommended because OKLCH gamut-mapping varies.

---

## 1. Executive Summary

| Severity | Count | Notes |
|---|---|---|
| **Critical** | 2 | One blocks keyboard users from escaping AppIntroModal; one fails text contrast on primary CTA / user message bubble |
| **Serious** | 5 | Touch-target undersizing on chat composer, missing skip link, h2-less prova EmptyState, hint live-region noise risk, decorative div soup in landmarks |
| **Moderate** | 7 | Heatmap day-cells small target, 10px HUD text everywhere, error-wine on canvas contrast risk, missing `<main>` on `/` and `/prova` EmptyState, status announcements may be missed, /privacidade is a contrast disaster (white-mode page in dark app), reduced-motion uses `!important` against animations the user may *want* |
| **Low / Quick win** | 6 | Decorative SVG / aria-hidden duplication, image alt text on user-uploaded images, language attribute on debrief code blocks, `outline-none` left in stylesheet, redundant aria-label on TierBadge, focus loss on tab change |
| **Conformance verdict** | **PARTIALLY CONFORMS** | A few critical fixes away from AA. The team has clearly read WCAG 2.2 — many SCs are explicitly cited in code comments. The remaining gaps are real but tractable. |

---

## 2. Critical Barriers (block access or fail core SC)

### C1 — AppIntroModal lacks focus trap and Escape handler
**WCAG**: 2.1.2 No Keyboard Trap (inverse — intentional trap is required for modal dialogs), 2.4.3 Focus Order, 2.1.1 Keyboard
**Severity**: Critical
**Location**: `src/app/components/AppIntroModal.tsx` (lines 144–260)
**Evidence**:
- `role="dialog"` + `aria-modal="true"` are set (lines 146–147) — declares modal semantics
- No `useFocusTrap` import, no `onKeyDown` for Escape, no focus-restore on dismiss
- Compare with `ConsentModal.tsx` (line 26: `const dialogRef = useFocusTrap...`) and `AchievementShard.tsx` (line 47: same pattern) — both apply the trap correctly

**Impact**: Keyboard-only users (and screen reader users in browse mode) can Tab out of the modal into the underlying chat UI while the dialog claims to be modal. Voice-over / NVDA will read both layers simultaneously. There is also no Escape route — the user must reach the visible buttons by Tab, and may not see a focus ring on the dimmed overlay first.

**Fix** (5 lines):

    import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

    const dismiss = useCallback((navigateToProva: boolean) => { /* existing body */ }, [onClose, router]);
    const dialogRef = useFocusTrap<HTMLDivElement>({
      active: open,
      onEscape: () => dismiss(false),
    });

    return (
      <div ref={dialogRef} role="dialog" aria-modal="true" ...

**Verification**: Open `/` as new user → press Tab → focus must cycle inside the modal. Press Escape → modal closes, focus returns to the `?` header button if it was opened from there.

---

### C2 — Primary CTA / user message bubble: white text on bright violet fails AA
**WCAG**: 1.4.3 Contrast (Minimum) — normal text requires 4.5:1, large text 3:1
**Severity**: Critical
**Location**: Many — `ChatMessage.tsx:73-77` (user bubble), `WelcomeScreen.tsx:74-86` (Começar chat), `ConsentModal.tsx:244-258` (Aceitar e continuar), `prova/page.tsx:339-350` (Começar expedição), `estudo/page.tsx:395-406` (Começar coleta), `AppIntroModal.tsx:229-241` (Começar pela Prova)
**Evidence**:
- `--violet-action: oklch(68% 0.2 290)` → approx sRGB #8c6dff, relative luminance ≈ 0.198
- `--ink-primary: oklch(96% 0.005 90)` → approx sRGB #f4f4ed, relative luminance ≈ 0.890
- Contrast ratio: (0.890 + 0.05) / (0.198 + 0.05) = **3.79 : 1**
- AA Normal text threshold: 4.5:1 → **FAIL**
- AA Large text threshold (≥18.66px regular or ≥14px bold): 3:1 → passes for buttons using 0.875rem+ bold; **fails for chat user bubble** (0.875rem, font-weight 400, prose body text)
- The CSS comment at `globals.css:30-32` claims "~4.4:1 over canvas-surface" — that's the *background* test for violet *as text*. The CSS does not measure ink-primary *on top of* violet-action, which is the actual usage here.

**Impact**: Children with reading difficulties, parents with mild cataracts or astigmatism, and anyone in direct sunlight on a phone will struggle to read their own chat messages and CTAs. The user-facing message bubble is the most-rendered text in the app.

**Fix options** (pick one):
1. Darken violet-action to oklch(56% 0.18 290) — ratio with ink-primary climbs to ~5.1:1
2. Keep violet-action L=0.68 but use `var(--canvas-base)` (near-black) as button text color for that bright surface
3. Add a violet-action "text-on" pair: `--violet-action-ink: oklch(14% 0.02 290)` for content sitting *on* violet

Recommend option 2 for user bubble (preserves the violet brand) and option 3 systematized for buttons. Update token usage in all 6 call sites listed above.

**Verification**: Use the deque-axe browser extension or APCA calculator. Target Lc ≥ 60 in APCA (more conservative than WCAG 2 for OLED dark themes). `[NEEDS LIVE TEST]` on a real Android panel — OKLCH gamut clipping on cheap displays can shift the perceived luminance.

---

## 3. Serious Issues (degraded experience but app remains usable)

### S1 — Chat composer touch targets below 44×44 industry minimum
**WCAG**: 2.5.8 Target Size (Minimum) requires 24×24 AA — the composer passes 24×24, **but** Apple HIG and Android Material both require 44×44/48dp, and Henrique is a 12-year-old on mobile.
**Severity**: Serious (passes AA letter, fails user-zero context)
**Location**: `ChatInput.tsx:44-74` (camera), `ChatInput.tsx:113-141` (send), `page.tsx:155-174` (header `?` button), `ChatMessage.tsx:113-187` (Ouvir/Parar TTS button)
**Evidence**:
- Camera + send buttons: `p-2.5` = 10px padding × 2 + 20px icon = **40×40px**
- Header `?` button: `w-9 h-9` = **36×36px**
- Chat-message TTS button: text-only, no min-height. Visual height ≈ 24–28px including font ascender

**Fix**:

    // ChatInput camera + send
    className="p-3 rounded-full shrink-0 transition-colors min-w-[44px] min-h-[44px]"

    // page.tsx header help button
    className="ml-auto shrink-0 w-11 h-11 rounded-full border ..."

    // ChatMessage TTS: wrap in padded button
    className="mt-2 -mx-2 -my-1 px-2 py-1.5 inline-flex items-center gap-1.5 min-h-[44px] ..."

Compare with the TabBar at `TabBar.tsx:118-120` which already does this correctly with `min-h-[44px]`.

---

### S2 — `/` (chat home) has no skip-to-content link
**WCAG**: 2.4.1 Bypass Blocks
**Severity**: Serious
**Location**: `src/app/layout.tsx`, `src/app/page.tsx`
**Evidence**: Every page mounts a header with logo, name, status, and `?` button (`page.tsx:121-175`) plus a TabBar (`TabBar.tsx`). Keyboard users must Tab through ~6 chrome elements before reaching the message list / chat input.
**Fix** (add to `layout.tsx` body, before `{children}`):

    <a
      href="#conteudo-principal"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-[var(--violet-action)] focus:text-[var(--canvas-base)] focus:rounded-md"
    >
      Pular para o conteúdo principal
    </a>

Then add `id="conteudo-principal"` to each route's `<main>` (already present in /prova, /estudo, /perfil — just needs the id; missing on `/`).

---

### S3 — Prova EmptyState heading hierarchy is fine but missing `<main>` landmark
**WCAG**: 1.3.1 Info and Relationships, 4.1.2 Name Role Value
**Severity**: Serious
**Location**: `src/app/prova/page.tsx` EmptyState (lines 219–353)
**Evidence**: EmptyState DOES use `<main>` (line 220). Active state ALSO uses `<main>` (line 471). But the **error/loading branches** (lines 438–462) render `<main>` too — and yet the top-level render (line 464–559) wraps both branches in a `<div>`. That `<div>` does not declare landmark semantics — outer layout is fine because `<main>` is inside the conditional.

**Real issue**: form inputs use `<label>` wrapping `<input>` with a child `<span>` as the visible text. That works for AT, but the visible label has no programmatic association via id — if anyone later refactors to floating labels, the implicit association will silently break. Add explicit `htmlFor`/`id`:

    <label htmlFor="prova-subject" className="flex flex-col gap-2">
      <span ...>Matéria</span>
      <input id="prova-subject" type="text" ... />
    </label>

Apply to all three inputs (subject, date, topic).

Also: the **date input has no `min` attribute** — users can pick a past date, which would create a study plan with negative days-to-exam. Edge case, not a11y, but the AT will read "0 days" and confuse the kid.

---

### S4 — Chat live region risk: streaming AI response re-announces on every token
**WCAG**: 4.1.3 Status Messages
**Severity**: Serious
**Location**: `src/app/components/chat/MessageList.tsx:93-99`
**Evidence**: The implementation is *better than most* — only the latest assistant message is in the live region. But: `aria-atomic="true"` on a region whose content is the **full streaming message** means VoiceOver / NVDA will re-read the entire growing response on every SSE token append. The `aria-atomic` combined with rapid content changes triggers what AT vendors call "interruption storms".

**Fix**: Two options.
1. Only announce the *completed* message — gate the live region on `!isLoading`:

       <div className="sr-only" aria-live="polite" aria-atomic="true">
         {!isLoading && latestAssistantMessage ? latestAssistantMessage.content : ""}
       </div>

   (already partially done — but during loading, the empty string is announced, then on stream completion the full text dumps at once. This is actually the right behavior — a single announcement at end of stream.)

2. `[NEEDS LIVE TEST]` Confirm the current code already does (1) correctly by streaming an answer with VoiceOver running. If `isLoading` flips to false only at end-of-stream, behavior is correct.

The CSS comment claims "only the latest assistant response is announced, avoiding re-announcement of the full transcript on every render" — but doesn't address mid-stream tokens. Test required.

---

### S5 — TypingIndicator uses `role="status"` but contains decorative dots that may be announced
**WCAG**: 4.1.2 Name, Role, Value
**Severity**: Serious (annoyance, not blocker)
**Location**: `src/app/components/TypingIndicator.tsx:1-42`
**Evidence**: The wrapper has `role="status" aria-label="Tutora está pensando"`. Good. But screen readers may still pick up the visible "Pensando" text inside, even though `aria-hidden="true"` is on the span. NVDA in browse mode has been known to ignore aria-hidden on siblings of a status region.
**Fix**: Move the aria-label to a `<span className="sr-only">` and remove the visual text from AT entirely, OR keep the visible "Pensando" as the accessible name (drop the aria-label) and add `aria-hidden="true"` to nothing inside the region. The current double-naming is redundant. `[NEEDS LIVE TEST]`.

---

## 4. Moderate Issues

### M1 — HUD 10px text is widespread (29 occurrences of 0.625rem and one 0.5625rem = 9px)
**WCAG**: 1.4.4 Resize Text (technically PASSES because user can zoom to 200% via the viewport allow `maximumScale: 5`), 1.4.12 Text Spacing (passes — no fixed pixel containers)
**Severity**: Moderate (legal AA passes; user-context fails)
**Location**: Searched via `grep "fontSize: \"0.625rem\""` → 29 hits across all HUD components. WelcomeScreen has a 9px divider label.
**Recommendation**: Letterspacing 0.16em-0.22em with 10px uppercase reads at maybe 14–15% of total width per glyph. Henrique's parents have presbyopia. Bump HUD micro-labels to 0.75rem (12px) and increase the `--text-meta` clamp lower bound to `0.75rem` minimum. Preserve uppercase + letterspacing aesthetic.

### M2 — Error-wine `oklch(65% 0.18 25)` on canvas: contrast borderline
**WCAG**: 1.4.3 Contrast (Minimum)
**Severity**: Moderate
**Location**: `globals.css:89`, used in `WelcomeScreen.tsx:158` (googleError), `prova/page.tsx:322-333`, `estudo/page.tsx:407-419`, and others as error text.
**Evidence**: L=0.65 on canvas-surface (L=0.18) ≈ 4.4:1. Right at the AA edge for normal text. The angle (25° = warm red) sits on a chromatically aggressive part of the gamut — perceptual contrast may dip below the math contrast for protanopic users.
**Fix**: Add `--error-wine-text: oklch(72% 0.16 25)` for text usage and reserve the L=0.65 token for fills/borders.

### M3 — Heatmap cells: 24×40px buttons fail target-size best practice
**WCAG**: 2.5.8 Target Size (Minimum) — AA exception allows clustered small targets, so technically passes. UX still degraded.
**Severity**: Moderate
**Location**: `HeatmapByMatter.tsx:48-89`
**Fix**: Wrap each cell button with `min-h-[44px] min-w-[44px]` and visually align the colored block inside via flex. Or accept the exception (data-viz cluster) and document it.

### M4 — Missing landmark/`<main>` on chat home loading flash
**WCAG**: 1.3.1 Info and Relationships, 2.4.1 Bypass Blocks
**Severity**: Moderate
**Location**: `src/app/page.tsx:101-104`
**Evidence**: While `consentGiven === null || studentName === null`, the page renders `<div className="h-dvh bg-[var(--canvas-base)]" aria-hidden="true" />`. `aria-hidden="true"` on the entire document body interval is OK because it's brief — but if hydration stalls (slow network), screen reader users hear silence with no context.
**Fix**: Replace with a `<div role="status" aria-busy="true" aria-label="Carregando seu perfil">` and add a visually hidden `<p className="sr-only">Carregando...</p>`.

### M5 — Status messages on grade buttons rely on `aria-disabled` + describedby, but `disabled` short-circuits AT in some configs
**WCAG**: 4.1.2 Name, Role, Value
**Severity**: Moderate
**Location**: `FlashcardDuel.tsx:351-380`
**Evidence**: The code is thoughtful — `disabled={!revealed} aria-disabled={!revealed} aria-describedby="flashcard-grade-hint"`. But `disabled` on `<button>` makes the element entirely unfocusable in most browsers. The screen reader user cannot tab to the button to hear the describedby explanation. NVDA in browse mode WILL read it; JAWS and VoiceOver focus mode skip disabled buttons.
**Fix**: Replace `disabled={!revealed}` with `aria-disabled={!revealed}` only, and gate the `onClick` handler with `if (!revealed) return`. The button stays focusable, the hint is reachable, the visual state is preserved via the existing CSS. (This is a known pattern — see https://adrianroselli.com/2024/08/exposing-field-errors.html for context.)

### M6 — `/privacidade` is a completely different visual mode (white background, gray text) in a dark-first app
**WCAG**: 1.4.3 Contrast (passes — black text on white passes trivially), 3.2.4 Consistent Identification (fails)
**Severity**: Moderate
**Location**: `src/app/privacidade/page.tsx:10` — `<div className="max-w-2xl mx-auto px-5 py-8 text-gray-800">`
**Evidence**: The whole policy page uses Tailwind defaults (`text-violet-600`, `text-gray-900`, white background via no override), breaking the design system. From a child-on-mobile in a dim bedroom at night, the page is a retina flashbang.
**Fix**: Rewrite using the same OKLCH tokens. This is also a brand-consistency issue, not pure a11y. Coordinate with design.

### M7 — Reduced motion uses `!important` to nuke ALL animation
**WCAG**: 2.3.3 Animation from Interactions (Level AAA — informative for AA)
**Severity**: Moderate
**Location**: `globals.css:465-480`
**Evidence**: The blanket `animation-duration: 0.01ms !important` kills the XP toast feedback, achievement banner, typing indicator, and quest active pulse for users who simply want vestibular safety. They still want to know they earned XP.
**Fix**: Differentiate "decorative motion" (drop entirely under reduced-motion) from "feedback motion" (replace with non-motion equivalent — e.g., XP toast stays visible for longer with opacity 1, no transform).

---

## 5. Low / Quick Wins (5-line fixes)

### L1 — Outline-none on inputs left in stylesheet even though box-shadow ring works
**Location**: `WelcomeScreen.tsx:60`, `ChatInput.tsx:101` — `outline-none transition-all`
**Fix**: Remove `outline-none` — it's a defensive Tailwind class that prevents native focus rings. The global `:focus-visible` rule uses `box-shadow` so the violet ring still appears, BUT `outline-none` blocks Windows High Contrast Mode focus rings which use real outlines. Replace with `focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[Highlight]` as a forced-colors fallback.

### L2 — TierBadge has both `aria-label` and `role="img"` — division text inside is announced redundantly
**Location**: `TierBadge.tsx:33-37, 107-119`
**Evidence**: Wrapper has `role="img" aria-label="Tier Aprendiz III"`, but the visible "III" span is not `aria-hidden`. AT will say "Tier Aprendiz III" then "III" again.
**Fix**: `<span aria-hidden="true" ...>{tier.division}</span>` on line 107.

### L3 — User-uploaded image alt text is generic
**Location**: `ChatMessage.tsx:97` — `alt="Foto do exercício enviada pelo aluno"`
**Severity**: Low (passes 1.1.1 with a generic alt, but provides zero info if the AI can't see the message either)
**Fix**: Once AI vision is in the loop, include the AI-detected exercise topic as alt. Until then, current alt is acceptable.

### L4 — `<code>` blocks in chat have no language attribute
**Location**: `ChatMessage.tsx:21-31`
**Severity**: Low
**Fix**: Add `lang="pt-BR"` on `<code>` if math/Portuguese; this helps screen readers pronounce mixed Portuguese-math content correctly. Often this is overengineering — `[NEEDS LIVE TEST]` to confirm screen reader misreads first.

### L5 — Service Worker registration auto-runs without prompt
**Location**: `src/app/components/ServiceWorkerRegistration.tsx` (not read here, but mounted in layout)
**Severity**: Low
**Recommendation**: Verify the SW doesn't intercept the consent flow (LGPD) and that offline page is keyboard-accessible. `[NEEDS LIVE TEST]`.

### L6 — TabBar active state has only color difference, no shape change
**WCAG**: 1.4.1 Use of Color
**Severity**: Low
**Location**: `TabBar.tsx:121-129`
**Evidence**: Active tab uses violet color and 12% violet background. Aria-current="page" exists (line 117), so AT is fine. But for colorblind users, the background-tint may not be perceptible. Add a 1px border or underline for active state.
**Fix**:

    style={{
      ...current,
      borderBottom: active ? "1.5px solid var(--violet-action)" : "1.5px solid transparent",
    }}

---

## 6. Things That ARE Accessible (Patterns to Keep)

The team is clearly accessibility-aware. Preserve these:

1. **Viewport meta done right** (`layout.tsx:42-52`) — `maximumScale: 5, userScalable: true` with explicit WCAG 1.4.4 citation. This single config breaks fewer apps than any other a11y win.
2. **Focus trap hook is solid** (`useFocusTrap.ts`) — handles Escape, restores previous focus on unmount, filters visible focusables. Use this EVERY modal (currently used by ConsentModal + AchievementShard; AppIntroModal is the gap).
3. **Color tokens are documented with measured ratios** (`globals.css:20-32, 70-77`) — every contrast adjustment includes the math and the rationale. This is rare and excellent. The miss is they didn't measure ink-primary *on top of* violet-action.
4. **TabBar uses `aria-current="page"` + `min-h-[44px]`** (`TabBar.tsx:117-120`) — textbook nav implementation.
5. **`role="log"` on chat transcript with scoped live region** (`MessageList.tsx:71-100`) — correct pattern, including the comment about avoiding `<main>` duplication.
6. **FlashcardDuel uses `aria-expanded` + `aria-controls`** (`FlashcardDuel.tsx:313-314`) for the reveal button. Genuinely thoughtful.
7. **`role="progressbar"` with valuenow/valuemax/aria-label** on `XpBar` (`XpBar.tsx:53-57`).
8. **MasteryDot uses `aria-label`** to convey color state non-visually (`estudo/page.tsx:58-83`).
9. **`prefers-reduced-motion` honored globally** (`globals.css:465-480`) — even if heavy-handed (see M7), the intent and coverage are right.
10. **Consent modal "refused" terminal state is keyboard-trapped** so users can't accidentally skip it (`ConsentModal.tsx:31-37`) — both legally and a11y-correctly handled.
11. **Image preview close button expanded to 44×44** via padded transparent surround (`ImagePreviewBar.tsx:31-49`) with WCAG citation in comment.
12. **Skeleton blocks have `aria-busy="true" aria-label`** (`LoadErrorState.tsx:74-95`).
13. **Error states use `role="alert"` + `aria-live="polite"`** so screen readers announce them but don't interrupt (`LoadErrorState.tsx:26-31`, `WelcomeScreen.tsx:154`, `prova/page.tsx:322`, `estudo/page.tsx:407`).
14. **Heading hierarchy is internally consistent** in /prova, /estudo, /perfil — h1 once, h2 for sections, h3 for cards. No skipped levels detected.

---

## 7. Live-Testing Required Before Sign-Off

The following items I could not verify by reading code:

1. **OKLCH gamut on cheap Android panels** — does the measured 4.4:1 hold on a Moto E budget device with a low-bit display?
2. **Screen reader behavior on streaming SSE chat** — does VoiceOver re-announce the assistant response on every token, or only at stream end?
3. **TypingIndicator's redundant aria-label vs visible text** — which one wins on NVDA + JAWS + VoiceOver iOS?
4. **TalkBack + focus restoration after FlashcardDuel grade button click** — does focus move predictably to the next card or get lost?
5. **Forced colors mode (Windows High Contrast)** — most OKLCH tokens are not present in `forced-colors` media query. Buttons may become invisible.
6. **Keyboard route transitions** — when navigating /chat → /prova via TabBar, where does focus land on the new page? Currently no programmatic focus management.
7. **`/auth/callback` flow** — server route only, but the redirect target may surface an auth-error message — is it announced?

---

## 8. Remediation Priority

### Immediate (block release if shipping for accessibility-regulated audience)
1. **C1**: Add focus trap + Escape handler to `AppIntroModal` — 5 lines, cite ConsentModal as template
2. **C2**: Re-token violet-action button text — pick option 2 (canvas-base text on violet) or option 3 (new --violet-action-ink token)

### Short-term (next sprint)
3. **S1**: Bump composer/header buttons to `min-h-[44px] min-w-[44px]`
4. **S2**: Add skip-to-content link in `layout.tsx`
5. **S3**: Add explicit `htmlFor`/`id` to /prova form inputs + add `min` attribute to date input
6. **S4**: Confirm streaming live-region behavior on real screen reader
7. **M5**: Replace `disabled` with `aria-disabled` on FlashcardDuel grade buttons
8. **M6**: Rewrite /privacidade in dark tokens

### Ongoing maintenance
- **M1**: Bump 10px HUD text to 12px minimum
- **M2**: Add `--error-wine-text` token
- **M7**: Differentiate decorative motion from feedback motion under reduced-motion
- **L1–L6**: Cleanup pass

### Re-audit timeline
After C1 + C2 + S1 + S2 + S3 land, schedule a **30-min real-device session** with NVDA on Windows + VoiceOver on iPhone with Henrique present. He will spot UX-feel issues that no auditor will.

---

## 9. References

- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- APCA (preferred contrast model for OLED dark UIs): https://www.myndex.com/APCA/
- WAI-ARIA Authoring Practices — Dialog: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- WAI-ARIA Authoring Practices — Tabs: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- Adrian Roselli on aria-disabled vs disabled: https://adrianroselli.com/2022/02/dont-disable-form-controls.html
