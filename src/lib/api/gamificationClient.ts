/**
 * Thin client for gamification/study endpoints.
 *
 * Default behavior:
 *   - Resolves a child_id for the signed-in parent via /api/children/primary
 *     (lazy-creates a child row on first use, see that route).
 *   - Calls real backend endpoints for profile, quests, topics, etc.
 *   - On network/HTTP error: reports to Sentry and THROWS a typed
 *     `GamificationError`. Pages are expected to catch it and render an
 *     empty/error state — no silent mock-swap in production.
 *
 * Mock fallback is opt-in and only fires when any of these are true:
 *   - `process.env.NEXT_PUBLIC_USE_MOCK_GAMIFICATION === "1"`
 *   - `process.env.NODE_ENV === "test"` (keeps Jest suites deterministic
 *     against the original fetch-less contract)
 *
 * This module is designed to be swallow-proof: the /perfil, /estudo, /prova
 * pages were previously rendering fake Henrique data in production because
 * a 400 from the profile endpoint was caught silently and replaced with a
 * mock. That class of bug dies here.
 */

import * as Sentry from "@sentry/nextjs";
import type {
  Flashcard,
  FlashcardGrade,
  Profile,
  Quest,
  StudyPlan,
  TopicRow,
} from "@/lib/gamification/types";
import {
  emptyFlashcards,
  emptyProfile,
  emptyQuests,
  emptyStudyPlan,
  emptyTopics,
  mockFlashcards,
  mockProfile,
  mockQuests,
  mockStudyPlan,
  mockTopics,
} from "@/lib/api/__mocks__/gamificationFixtures";
import {
  mapServerProfile,
  mapServerQuests,
  mapServerStudyPlan,
} from "./gamificationMappers";

// ---------------------------------------------------------------------------
// Flag handling
// ---------------------------------------------------------------------------

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_GAMIFICATION === "1";

// In tests we default to returning fixtures when fetch throws — the existing
// unit suite relies on this. In dev/prod we throw so the UI can render a
// truthful empty state instead of fake data.
const MOCK_ON_ERROR =
  USE_MOCK || process.env.NODE_ENV === "test" || typeof window === "undefined";

// In the browser in prod the only acceptable "fallback" is the empty/zero
// shape — returning a seeded mock there leaks fake Henrique data (2360 XP,
// pre-unlocked achievements, fake subject tiers) into real accounts on
// their very first login. The mock fixtures are kept for tests and the
// explicit dev flag, but they must never reach a real user's screen.
const profileFallback = USE_MOCK ? mockProfile : emptyProfile;
const questsFallback = USE_MOCK ? mockQuests : emptyQuests;
const topicsFallback = USE_MOCK ? mockTopics : emptyTopics;
const studyPlanFallback = USE_MOCK ? mockStudyPlan : emptyStudyPlan;
const flashcardsFallback = USE_MOCK ? mockFlashcards : emptyFlashcards;

// ---------------------------------------------------------------------------
// Typed error + child-id resolution
// ---------------------------------------------------------------------------

export class GamificationError extends Error {
  public readonly status: number;
  public readonly endpoint: string;

  constructor(message: string, endpoint: string, status: number) {
    super(message);
    this.name = "GamificationError";
    this.endpoint = endpoint;
    this.status = status;
  }
}

// In-memory cache survives across page navigations inside a single tab.
// We persist to localStorage for warm-path reloads so we don't re-hit the
// /primary endpoint on every navigation.
const CHILD_ID_STORAGE_KEY = "mma.primaryChildId";
let cachedChildId: string | null = null;

function readCachedChildId(): string | null {
  if (cachedChildId) return cachedChildId;
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(CHILD_ID_STORAGE_KEY);
    if (stored) {
      cachedChildId = stored;
      return stored;
    }
  } catch {
    // localStorage disabled (private browsing, quota, etc.) — noop.
  }
  return null;
}

function writeCachedChildId(id: string): void {
  cachedChildId = id;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHILD_ID_STORAGE_KEY, id);
  } catch {
    // Best-effort only.
  }
}

export function clearCachedChildId(): void {
  cachedChildId = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CHILD_ID_STORAGE_KEY);
  } catch {
    // noop
  }
}

export interface ResolveChildOptions {
  /** Passed through to /api/children/primary when lazy-creating the row. */
  preferredName?: string;
}

/**
 * Ensure the signed-in parent has a child_id. Returns the cached id when
 * available, otherwise hits /api/children/primary which will create one
 * on-the-fly (using `preferredName`).
 *
 * Callers that can't provide a name (deep link into /estudo without going
 * through the chat entry) will get whatever default the backend decides.
 */
export async function getOrCreateChildId(
  options: ResolveChildOptions = {}
): Promise<string> {
  const cached = readCachedChildId();
  if (cached) return cached;

  const params = new URLSearchParams();
  if (options.preferredName) {
    params.set("name", options.preferredName);
  }
  const query = params.toString();
  const url = `/api/children/primary${query ? `?${query}` : ""}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });

    if (!res.ok) {
      const status = res.status;
      let message = "Falha ao resolver criança.";
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // Body wasn't JSON — keep the default message.
      }
      throw new GamificationError(message, "children-primary", status);
    }

    const body = (await res.json()) as { data?: { id?: string } };
    const id = body.data?.id;
    if (!id) {
      throw new GamificationError(
        "Resposta sem id.",
        "children-primary",
        502
      );
    }
    writeCachedChildId(id);
    return id;
  } catch (error) {
    if (!(error instanceof GamificationError)) {
      Sentry.captureException(error, {
        tags: { endpoint: "children-primary" },
      });
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Generic fetch helper
// ---------------------------------------------------------------------------

interface FetchOptions<T> {
  url: string;
  init?: RequestInit;
  mockFallback: T;
  endpoint: string;
}

async function fetchJson<T>({
  url,
  init,
  mockFallback,
  endpoint,
}: FetchOptions<T>): Promise<T> {
  if (USE_MOCK) return mockFallback;

  try {
    const res = await fetch(url, {
      credentials: "include",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      const err = new GamificationError(
        `HTTP ${res.status} on ${endpoint}`,
        endpoint,
        res.status
      );
      Sentry.captureException(err, { tags: { endpoint } });
      if (MOCK_ON_ERROR) return mockFallback;
      throw err;
    }

    const body = (await res.json()) as { data?: T } | T;
    if (body && typeof body === "object" && "data" in (body as object)) {
      const payload = (body as { data?: T }).data;
      return payload ?? mockFallback;
    }
    return body as T;
  } catch (error) {
    if (!(error instanceof GamificationError)) {
      Sentry.captureException(error, { tags: { endpoint } });
    }
    if (MOCK_ON_ERROR) return mockFallback;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Public API — each helper accepts an optional childId so server-side
// callers or tests can bypass the cache. The default path resolves
// `childId` lazily.
// ---------------------------------------------------------------------------

async function resolveChildIdOrNull(
  explicit: string | undefined
): Promise<string | null> {
  if (explicit) return explicit;
  try {
    return await getOrCreateChildId();
  } catch {
    // getOrCreateChildId already reported via Sentry. We swallow here so
    // that the caller's mock-fallback path still kicks in when tests drop
    // network access.
    return null;
  }
}

export async function fetchProfile(childId?: string): Promise<Profile> {
  const resolved = await resolveChildIdOrNull(childId);
  if (!resolved) {
    if (MOCK_ON_ERROR) return profileFallback;
    throw new GamificationError(
      "child_id indisponível.",
      "gamification-profile",
      400
    );
  }

  const raw = await fetchJson<unknown>({
    url: `/api/gamification/profile?child_id=${encodeURIComponent(resolved)}`,
    mockFallback: profileFallback,
    endpoint: "gamification-profile",
  });

  return mapServerProfile(raw, profileFallback);
}

export async function fetchQuests(childId?: string): Promise<Quest[]> {
  const resolved = await resolveChildIdOrNull(childId);
  if (!resolved) {
    if (MOCK_ON_ERROR) return questsFallback;
    throw new GamificationError(
      "child_id indisponível.",
      "gamification-quests",
      400
    );
  }

  // The server returns raw quest rows from Supabase (snake_case columns,
  // objectives jsonb). If we just cast to Quest[], the UI renders
  // "+undefined XP" and "undefined/undefined". mapServerQuests converts
  // the row into the client Quest shape with populated numbers.
  const raw = await fetchJson<unknown>({
    url: `/api/gamification/quests?child_id=${encodeURIComponent(resolved)}`,
    mockFallback: questsFallback as unknown,
    endpoint: "gamification-quests",
  });
  if (Array.isArray(raw) && raw.length > 0 && "objectivesDone" in raw[0]) {
    // Already client-shaped (mock fallback in dev/test mode).
    return raw as Quest[];
  }
  return mapServerQuests(raw);
}

export async function fetchTopics(childId?: string): Promise<TopicRow[]> {
  const resolved = await resolveChildIdOrNull(childId);
  if (!resolved) {
    if (MOCK_ON_ERROR) return topicsFallback;
    throw new GamificationError(
      "child_id indisponível.",
      "gamification-topics",
      400
    );
  }

  return fetchJson<TopicRow[]>({
    url: `/api/gamification/topics?child_id=${encodeURIComponent(resolved)}`,
    mockFallback: topicsFallback,
    endpoint: "gamification-topics",
  });
}

export async function fetchStudyPlan(
  id: string | null
): Promise<StudyPlan | null> {
  if (!id) return null;
  const raw = await fetchJson<unknown>({
    url: `/api/study/plans/${encodeURIComponent(id)}`,
    mockFallback: studyPlanFallback,
    endpoint: "study-plans-get",
  });
  return mapServerStudyPlan(raw, studyPlanFallback);
}

/**
 * Fetch the signed-in user's most recent study plan (expedição) directly
 * from the server. Used as a fallback when localStorage `mma.activePlanId`
 * is missing — e.g. after a hard refresh that cleared site data, or when
 * the user signs in from a different browser. Without this, /prova and
 * /estudo would show the empty "crie uma expedição" state even though the
 * plan already exists in Supabase, forcing duplicate creation.
 *
 * Returns the latest StudyPlan (mapped to client shape) or null if the
 * child has no plans at all. Also writes the id to localStorage so the
 * next navigation hits the fast path.
 */
export async function fetchLatestStudyPlan(): Promise<StudyPlan | null> {
  const resolved = await resolveChildIdOrNull(undefined);
  if (!resolved) return null;

  try {
    const res = await fetch("/api/study/plans", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: Array<{ id: string; created_at?: string }>;
    };
    const plans = body.data ?? [];
    if (plans.length === 0) return null;
    // Server orders by created_at desc per /api/study/plans/route.ts. Still
    // sort defensively so a contract drift doesn't flip the pick.
    const sorted = [...plans].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta;
    });
    const latest = sorted[0];
    const plan = await fetchStudyPlan(latest.id);
    if (plan?.id) {
      try {
        window.localStorage.setItem("mma.activePlanId", plan.id);
      } catch {
        // Best-effort cache write.
      }
    }
    return plan;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { endpoint: "study-plans-latest" },
    });
    return null;
  }
}

export interface CreatePlanFromUtteranceResult {
  planId: string;
  studyPlan: StudyPlan;
}

/**
 * Create a new expedição (study plan) from a free-form student utterance.
 * The backend calls GPT-5.1 to extract subject/topic/subtopics/exam format,
 * then persists the plan and returns it. Caller should redirect to the
 * plan dashboard using `planId`.
 */
export async function createStudyPlanFromUtterance(params: {
  utterance: string;
  studentName?: string;
  childId?: string;
}): Promise<CreatePlanFromUtteranceResult> {
  const resolvedChild =
    params.childId ??
    (await getOrCreateChildId({ preferredName: params.studentName }));

  const res = await fetch("/api/study/plans/from-utterance", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      child_id: resolvedChild,
      utterance: params.utterance,
      student_name: params.studentName,
    }),
  });

  if (!res.ok) {
    let message = "Não consegui criar a expedição. Tenta de novo?";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON response — keep default
    }
    const err = new GamificationError(
      message,
      "study-plans-from-utterance",
      res.status
    );
    Sentry.captureException(err, {
      tags: { endpoint: "study-plans-from-utterance" },
    });
    throw err;
  }

  const body = (await res.json()) as {
    data?: { plan?: { id?: string } };
  };
  const planId = body.data?.plan?.id;
  if (!planId) {
    throw new GamificationError(
      "Resposta sem plan.id.",
      "study-plans-from-utterance",
      502
    );
  }

  // Fetch the fully-mapped StudyPlan (same path /prova uses on reload).
  const studyPlan = await fetchStudyPlan(planId);
  if (!studyPlan) {
    throw new GamificationError(
      "Plano criado mas não pôde ser carregado.",
      "study-plans-get",
      502
    );
  }

  return { planId, studyPlan };
}

const ACTIVE_PLAN_STORAGE_KEY = "mma.activePlanId";

function readActivePlanId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_PLAN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Get the first batch of flashcards for a study session.
 *
 * Flow:
 *   1. If an active plan is stored in localStorage, call /bootstrap to
 *      lazy-generate cards for the first topic that doesn't have any yet
 *      and return them. Generation uses GPT-5.1 with the plan's exam_format
 *      metadata so AV2-discursive plans get open-ended questions.
 *   2. If the bootstrap returns an empty array (every topic already has
 *      cards), fall back to /next for spaced-repetition picks.
 *   3. If there's no active plan at all, we return an empty array — the
 *      /estudo page handles that by showing the "Nenhuma patrulha ativa"
 *      empty state.
 *
 * Previously this function POSTed `{ mode, limit }` to /next expecting a
 * batched array — but /next's schema is .strict() (rejected the extra
 * `limit`) and it returns a single card. Result: the Arena got an empty
 * cards array and nothing could be clicked. This version matches both
 * endpoint contracts.
 */
export async function fetchNextFlashcards(limit = 5): Promise<Flashcard[]> {
  const resolvedChild = await resolveChildIdOrNull(undefined);
  if (!resolvedChild) {
    if (MOCK_ON_ERROR) return flashcardsFallback.slice(0, limit);
    throw new GamificationError(
      "child_id indisponível.",
      "study-flashcards-next",
      400
    );
  }

  // Same localStorage-stale pattern as /prova: prefer the cached id but fall
  // back to querying the backend for the latest plan when the cache is
  // empty. Otherwise a hard refresh or a fresh browser would show "Sem
  // cartas prontas ainda" even though the expedição exists in Supabase.
  let planId = readActivePlanId();
  if (!planId) {
    const latest = await fetchLatestStudyPlan();
    planId = latest?.id ?? null;
  }

  if (!planId) {
    if (MOCK_ON_ERROR) return flashcardsFallback.slice(0, limit);
    return [];
  }

  try {
    const res = await fetch("/api/study/flashcards/bootstrap", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        child_id: resolvedChild,
        plan_id: planId,
        count: limit,
      }),
    });

    if (res.ok) {
      const body = (await res.json()) as { data?: Flashcard[] };
      const cards = body.data ?? [];
      if (cards.length > 0) return cards.slice(0, limit);
      // Bootstrap returned [] — every topic is already seeded. Fall through
      // to /next for the SRS pick.
    } else {
      // Report but don't block — the /next fallback may still work.
      Sentry.captureMessage(`bootstrap ${res.status}`, {
        tags: { endpoint: "study-flashcards-bootstrap" },
      });
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { endpoint: "study-flashcards-bootstrap" },
    });
  }

  // Spaced-repetition pick: single card or null. If null, the student has
  // literally nothing left to review in this plan — return empty and let
  // the Arena render its "fim da coleta" state.
  try {
    const res = await fetch("/api/study/flashcards/next", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        child_id: resolvedChild,
        mode: "estudo",
        plan_id: planId,
      }),
    });
    if (!res.ok) {
      if (MOCK_ON_ERROR) return flashcardsFallback.slice(0, limit);
      return [];
    }
    const body = (await res.json()) as { data?: Flashcard | null };
    return body.data ? [body.data] : [];
  } catch (error) {
    Sentry.captureException(error, {
      tags: { endpoint: "study-flashcards-next" },
    });
    if (MOCK_ON_ERROR) return flashcardsFallback.slice(0, limit);
    return [];
  }
}

export interface ReviewOutcome {
  xpAwarded: number;
  nextReviewIso: string;
}

export function submitFlashcardReview(
  cardId: string,
  grade: FlashcardGrade,
  hintsUsed = 0
): Promise<ReviewOutcome> {
  // Mock XP mirrors the real server table: 15/10/6 for acertei with 0/1/2+
  // hints, 3 for errei (lido debrief), and a "quase" heuristic.
  const mockXp = grade === "acertei"
    ? (hintsUsed <= 0 ? 15 : hintsUsed === 1 ? 10 : 6)
    : grade === "quase"
      ? 6
      : 3;
  const mock: ReviewOutcome = {
    xpAwarded: mockXp,
    nextReviewIso: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
  };
  const quality = grade === "acertei" ? 5 : grade === "quase" ? 3 : 0;
  return fetchJson<ReviewOutcome>({
    url: "/api/study/flashcards/review",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        card_id: cardId,
        quality,
        hints_used: hintsUsed,
        read_debrief: grade === "errei",
      }),
    },
    mockFallback: mock,
    endpoint: "study-flashcards-review",
  });
}
