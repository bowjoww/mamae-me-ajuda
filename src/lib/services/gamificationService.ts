/**
 * Gamification engine.
 *
 * Core rules (unchangeable):
 *  - XP rewards Socratic engagement. NEVER speed, NEVER raw accuracy.
 *  - Level accumulates and never decreases.
 *  - Rank (MMR) fluctuates: 40% accuracy / 25% engagement / 20% consistency / 15% difficulty.
 *
 * Keep this file framework-agnostic enough that the math is unit-testable
 * without a Supabase connection. The IO helpers are split out so they can
 * be mocked one by one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AchievementCatalogRow,
  Quest,
  QuestObjective,
  XpReason,
} from "@/lib/supabase/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DBClient = SupabaseClient<any>;

// ---------------------------------------------------------------------------
// Ranks & MMR
// ---------------------------------------------------------------------------

/**
 * The 7 ranks. Divisions are I (highest) > II > III (lowest) inside each rank.
 * Progressing means climbing III -> II -> I before promotion to the next rank.
 *
 * Labels follow the sandbox/crafting/survival frame (see migration 004 and
 * `src/lib/gamification/types.ts`). The mechanic — 7 × 3 grid, MMR span of
 * 1200 per rank, division span of 400 — is unchanged.
 */
export const RANKS = [
  "Aprendiz",
  "Batedor",
  "Explorador",
  "Coletor",
  "Artesão",
  "Cartógrafo",
  "Mestre",
] as const;
export type Rank = (typeof RANKS)[number];
export type Division = "I" | "II" | "III";

// Each rank spans 1200 MMR; divisions are 400 wide.
// Aprendiz III starts at 0, Mestre I ends at 8400.
const RANK_SPAN = 1200;
const DIVISION_SPAN = 400;
const DIVISIONS: Division[] = ["III", "II", "I"]; // order within a rank

export function computeRankFromMmr(mmr: number): { rank: Rank; division: Division } {
  const clamped = Math.max(0, Math.min(mmr, (RANKS.length - 1) * RANK_SPAN + DIVISION_SPAN * 3 - 1));
  const rankIdx = Math.min(RANKS.length - 1, Math.floor(clamped / RANK_SPAN));
  const within = clamped - rankIdx * RANK_SPAN;
  const divIdx = Math.min(2, Math.floor(within / DIVISION_SPAN));
  return { rank: RANKS[rankIdx], division: DIVISIONS[divIdx] };
}

// ---------------------------------------------------------------------------
// XP table — the single source of truth. Never reference speed.
// ---------------------------------------------------------------------------

export const XP_TABLE = Object.freeze({
  flashcard_no_hint: 15,
  flashcard_1_hint: 10,
  flashcard_2plus_hints: 6,
  error_read_debrief: 3,
  simulado_completed: 50,
  focus_session: 20,
  achievement_unlock: 0, // written separately with the achievement's own reward
  daily_complete: 30,
  weekly_complete: 120,
}) satisfies Record<XpReason, number>;

export interface XpComputation {
  delta: number;
  reason: XpReason;
}

/**
 * Classify a flashcard review into its XP reason purely from hints used.
 * The intentionally flat scale prevents "game the hint count" behaviour:
 * using 1 hint is still strictly worthwhile vs. using 2+.
 */
export function classifyFlashcardXp(hintsUsed: number, correct: boolean, readDebrief: boolean): XpComputation {
  if (!correct) {
    return readDebrief
      ? { delta: XP_TABLE.error_read_debrief, reason: "error_read_debrief" }
      : { delta: 0, reason: "error_read_debrief" };
  }
  if (hintsUsed <= 0) return { delta: XP_TABLE.flashcard_no_hint, reason: "flashcard_no_hint" };
  if (hintsUsed === 1) return { delta: XP_TABLE.flashcard_1_hint, reason: "flashcard_1_hint" };
  return { delta: XP_TABLE.flashcard_2plus_hints, reason: "flashcard_2plus_hints" };
}

export function simuladoBonus(accuracy: number): number {
  const a = Math.max(0, Math.min(1, accuracy));
  // Base 50 XP + up to 50 XP acurácia-graded. No time bonus, no speed bonus.
  return XP_TABLE.simulado_completed + Math.round(a * 50);
}

// ---------------------------------------------------------------------------
// MMR calculation — pure function over raw stats
// ---------------------------------------------------------------------------

export interface MmrInputs {
  accuracyLast30: number; // 0..1 — correct / reviewed across last 30 cards
  socraticEngagement: number; // 0..1 — mean (1 - hintsUsed/hintsAvailable)
  consistencyDays: number; // 0..7 — distinct active days in last 7
  averageDifficulty: number; // 0..1 — easy=0.2, medium=0.5, hard=0.9
}

/**
 * Returns an MMR value in [0, 10000]. Guard-rails for invalid input.
 * Weights (40/25/20/15) come from the product brief. Keep the math
 * transparent — auditors must be able to re-derive this by hand.
 */
export function recalculateMmr(inputs: MmrInputs): number {
  const acc = Math.max(0, Math.min(1, inputs.accuracyLast30));
  const eng = Math.max(0, Math.min(1, inputs.socraticEngagement));
  const cons = Math.max(0, Math.min(1, inputs.consistencyDays / 7));
  const diff = Math.max(0, Math.min(1, inputs.averageDifficulty));

  const raw =
    0.4 * acc +
    0.25 * eng +
    0.2 * cons +
    0.15 * diff;

  return Math.round(raw * 10000);
}

// ---------------------------------------------------------------------------
// Level (never decreases) — monotonically rising with total_xp.
// Curve: level n requires sum_{i=1..n} 100*i XP, i.e. triangular numbers.
// ---------------------------------------------------------------------------

export function levelFromXp(totalXp: number): number {
  if (totalXp <= 0) return 1;
  // level l satisfies: 50*l*(l+1) <= totalXp < 50*(l+1)*(l+2)
  // Solve: l = floor((-1 + sqrt(1 + 8*totalXp/100)) / 2) + 1
  const l = Math.floor((-1 + Math.sqrt(1 + totalXp / 12.5)) / 2);
  return Math.max(1, l + 1);
}

// ---------------------------------------------------------------------------
// Achievement rule evaluation — tiny DSL
// ---------------------------------------------------------------------------

export interface AchievementEvalStats {
  xpEventCounts: Partial<Record<XpReason, number>>;
  streakNoHint: number;
  sessionDurationsMinutes: number[];
  studyPlansCount: number;
  distinctTopicsReviewed: number;
  lastStudyHour?: number;
  cardRetryMaxStreak: number;
  returnedAfterDays?: number;
  latestSimuladoAccuracy?: number;
  hadPreviousErrors?: boolean;
}

/**
 * Evaluate a single catalog rule against stats. Defensive — returns false on
 * unknown rule shapes rather than throwing, so new rule kinds can be added in
 * a future migration without a code deploy.
 */
export function evaluateRule(rule: unknown, stats: AchievementEvalStats): boolean {
  if (!rule || typeof rule !== "object") return false;
  const r = rule as Record<string, unknown>;
  const type = r.type;

  if (type === "xp_event_count") {
    const reasons = Array.isArray(r.reason_in) ? (r.reason_in as XpReason[]) : [];
    const target = typeof r.count === "number" ? r.count : 0;
    const total = reasons.reduce((acc, reason) => acc + (stats.xpEventCounts[reason] ?? 0), 0);
    return total >= target;
  }
  if (type === "flashcard_streak_no_hint") {
    const target = typeof r.count === "number" ? r.count : 0;
    return stats.streakNoHint >= target;
  }
  if (type === "session_duration_minutes") {
    const target = typeof r.min === "number" ? r.min : 0;
    return stats.sessionDurationsMinutes.some((m) => m >= target);
  }
  if (type === "study_plans_count") {
    const target = typeof r.count === "number" ? r.count : 0;
    return stats.studyPlansCount >= target;
  }
  if (type === "distinct_topics_reviewed") {
    const target = typeof r.count === "number" ? r.count : 0;
    return stats.distinctTopicsReviewed >= target;
  }
  if (type === "study_time_window") {
    if (typeof stats.lastStudyHour !== "number") return false;
    const start = typeof r.start_hour === "number" ? r.start_hour : 0;
    const end = typeof r.end_hour === "number" ? r.end_hour : 0;
    return stats.lastStudyHour >= start && stats.lastStudyHour <= end;
  }
  if (type === "card_retry_streak") {
    const target = typeof r.min_retries === "number" ? r.min_retries : 0;
    return stats.cardRetryMaxStreak >= target;
  }
  if (type === "streak_returned") {
    if (typeof stats.returnedAfterDays !== "number") return false;
    const after = typeof r.after_days === "number" ? r.after_days : 0;
    return stats.returnedAfterDays >= after;
  }
  if (type === "simulado_comeback") {
    const minAcc = typeof r.min_accuracy === "number" ? r.min_accuracy : 0;
    return (
      (stats.hadPreviousErrors ?? false) &&
      (stats.latestSimuladoAccuracy ?? 0) >= minAcc
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// Quest generation — deterministic rotation per child+day.
// We never expose the random seed; a child cannot farm the exact easy quest
// by re-rolling, because the seed is derived from (childId, yyyymmdd).
// ---------------------------------------------------------------------------

const DAILY_QUEST_POOL: Array<{
  title: string;
  description: string;
  kind: string;
  target: number;
  xp: number;
}> = [
  { title: "Coleta do Dia", description: "Revise 5 flashcards hoje.", kind: "cards_reviewed", target: 5, xp: 30 },
  { title: "Terreno Novo", description: "Estude um tópico inédito por pelo menos 10 minutos.", kind: "new_topic_minutes", target: 10, xp: 40 },
  { title: "Sessão Focada", description: "Conclua 1 sessão de estudo de 15+ minutos.", kind: "focus_session_minutes", target: 15, xp: 35 },
  { title: "Releitura Honesta", description: "Leia a resolução completa de 2 erros hoje.", kind: "debriefs_read", target: 2, xp: 25 },
  { title: "Com uma dica", description: "Acerte 3 cards usando apenas 1 dica.", kind: "cards_1_hint", target: 3, xp: 35 },
  { title: "Sozinho na trilha", description: "Acerte 2 cards sem usar nenhuma dica.", kind: "cards_no_hint", target: 2, xp: 40 },
  { title: "Exploração", description: "Toque em 3 tópicos diferentes.", kind: "distinct_topics", target: 3, xp: 30 },
];

export function dailyQuestSeed(childId: string, day: Date): number {
  const iso = day.toISOString().slice(0, 10); // YYYY-MM-DD
  const combined = `${childId}|${iso}`;
  let hash = 2166136261;
  for (let i = 0; i < combined.length; i++) {
    hash ^= combined.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDailyQuestDefinitions(childId: string, day: Date): Array<{
  title: string;
  description: string;
  objectives: QuestObjective[];
  xp_reward: number;
}> {
  const seed = dailyQuestSeed(childId, day);
  const rng = mulberry32(seed);
  const pool = [...DAILY_QUEST_POOL];
  // Fisher-Yates, deterministic on the seed.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, 3).map((q) => ({
    title: q.title,
    description: q.description,
    objectives: [{ kind: q.kind, target: q.target, progress: 0 }],
    xp_reward: q.xp,
  }));
}

export const WEEKLY_QUEST_POOL: Array<{
  title: string;
  description: string;
  kind: string;
  target: number;
  xp: number;
}> = [
  { title: "Travessia da semana", description: "Complete 30 flashcards nesta semana.", kind: "cards_reviewed_weekly", target: 30, xp: 200 },
  { title: "Ritmo firme", description: "Estude em 5 dias diferentes desta semana.", kind: "active_days_weekly", target: 5, xp: 250 },
];

// ---------------------------------------------------------------------------
// Power-up drops — rarity-weighted but bounded so a streak of luck can't
// drown a child in items. Caller decides WHEN to roll.
// ---------------------------------------------------------------------------

const DROP_WEIGHTS: Record<string, number> = {
  common: 0.6,
  uncommon: 0.3,
  rare: 0.1,
};

export function rollPowerUpDrop(
  candidates: Array<{ code: string; rarity: string }>,
  rng: () => number = Math.random
): { code: string } | null {
  if (candidates.length === 0) return null;
  // 40% drop rate — see docs/gamification-engine.md (quests should not
  // guarantee loot; a generous-but-not-automatic roll keeps the chest
  // special). Previous code said 40% in comment but was actually 40% drop
  // (rng() > 0.4 → 60% early-return), so rng() >= 0.4 makes the intent
  // explicit: only proceed when the roll falls in the bottom 40%.
  if (rng() >= 0.4) return null;

  const weighted = candidates.map((c) => ({
    code: c.code,
    weight: DROP_WEIGHTS[c.rarity] ?? 0.1,
  }));
  const total = weighted.reduce((acc, w) => acc + w.weight, 0);
  let pick = rng() * total;
  for (const w of weighted) {
    pick -= w.weight;
    if (pick <= 0) return { code: w.code };
  }
  return { code: weighted[weighted.length - 1].code };
}

// ---------------------------------------------------------------------------
// IO helpers (thin Supabase wrappers — keep the above pure for tests)
// ---------------------------------------------------------------------------

export async function awardXp(
  supabase: DBClient,
  params: {
    childId: string;
    delta: number;
    reason: XpReason;
    context?: Record<string, unknown>;
  }
): Promise<{ newTotal: number | null; error: string | null }> {
  if (params.delta === 0) {
    return { newTotal: null, error: null };
  }
  const { data, error } = await supabase.rpc("award_xp", {
    p_child_id: params.childId,
    p_delta: params.delta,
    p_reason: params.reason,
    p_context: (params.context ?? {}) as Record<string, unknown>,
  });
  if (error) return { newTotal: null, error: error.message };
  return { newTotal: (data as number | null) ?? null, error: null };
}

export async function fetchAchievementsCatalog(supabase: DBClient): Promise<AchievementCatalogRow[]> {
  // Bounded query: the catalog is small (<30 rows today) but a missing LIMIT
  // is the kind of unbounded read that bites when a seed script drifts.
  const { data, error } = await supabase
    .from("achievements_catalog")
    .select("*")
    .limit(50);
  if (error || !data) return [];
  return data;
}

export async function fetchActiveQuests(
  supabase: DBClient,
  childId: string
): Promise<Quest[]> {
  // A child should never have more than ~5 active quests (3 daily + 2 weekly).
  // 20 is a generous ceiling that still fences off runaway states.
  const { data, error } = await supabase
    .from("quests")
    .select("*")
    .eq("child_id", childId)
    .eq("status", "active")
    .limit(20);
  if (error || !data) return [];
  return data;
}
