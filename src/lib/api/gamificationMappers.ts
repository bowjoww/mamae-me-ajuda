/**
 * Adapters between server-persisted shapes (raw Supabase rows) and the
 * richer client-side domain types that the HUD/profile/expedition surfaces
 * consume.
 *
 * The server currently returns:
 *   - /api/gamification/profile → { profile: UserProfileRow, achievements: [...], inventory: [...], child_name }
 *   - /api/study/plans/:id     → { plan: StudyPlanRow, topics: StudyTopicRow[] }
 *
 * The client wants:
 *   - Profile  (studentName, tier, subjects[], activity7d[], achievements, inventory, ...)
 *   - StudyPlan (title, subject, examDateIso, missions[], tier, ...)
 *
 * The gap is real — the server hasn't shipped the aggregated shape yet. To
 * avoid blocking the launch we translate what we have and fill the rest
 * from the caller-provided fallback (mock profile / mock plan). That fallback
 * carries honest defaults (zero XP, no mastered subjects) when the user has
 * no activity yet, and is replaced piece by piece as the backend gains the
 * matching aggregation queries.
 */

import type {
  Achievement,
  PowerUp,
  Profile,
  Quest,
  QuestStatus,
  StudyPlan,
  Subject,
} from "@/lib/gamification/types";
import { SUBJECTS } from "@/lib/gamification/types";

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

interface ServerProfileRow {
  total_xp?: number | null;
  current_rank?: string | null;
  rank_division?: "I" | "II" | "III" | null;
  display_title?: string | null;
  streak_days?: number | null;
  last_active_at?: string | null;
}

interface ServerAchievement {
  achievement_code: string;
  unlocked_at: string | null;
}

interface ServerInventoryRow {
  power_up_code: string;
  qty: number;
}

interface ServerProfileEnvelope {
  profile?: ServerProfileRow | null;
  achievements?: ServerAchievement[] | null;
  inventory?: ServerInventoryRow[] | null;
  child_name?: string | null;
}

type ProfileRank = Profile["tier"]["rank"];

function isServerProfileEnvelope(value: unknown): value is ServerProfileEnvelope {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return "profile" in v || "achievements" in v || "inventory" in v || "child_name" in v;
}

function isClientProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.studentName === "string" &&
    typeof v.totalXp === "number" &&
    Array.isArray(v.subjects)
  );
}

function normalizeRank(raw: string | null | undefined): ProfileRank {
  if (!raw) return "aprendiz";
  const slug = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const allowed: ProfileRank[] = [
    "aprendiz",
    "batedor",
    "explorador",
    "coletor",
    "artesao",
    "cartografo",
    "mestre",
  ];
  return (allowed as string[]).includes(slug) ? (slug as ProfileRank) : "aprendiz";
}

/**
 * Translate the server profile envelope into the rich client Profile shape.
 *
 * The fallback is used ONLY as a typed scaffolding for envelope shape — the
 * mapper never bleeds fallback-derived "data" (subjects, achievements, XP
 * progress) into the response. Missing fields collapse to honest zeros so
 * a fresh account renders an empty state instead of a ghost profile that
 * lies about activity the user didn't do.
 *
 * History: an earlier version copied `fallback.currentXp`, `fallback.subjects`,
 * `fallback.achievements` when the server returned null — producing a perfil
 * page that looked "completão" for brand-new Google signups. See the session
 * notes for 2026-04-21 where the Board caught it live.
 */
export function mapServerProfile(raw: unknown, fallback: Profile): Profile {
  if (isClientProfile(raw)) return raw;
  if (!isServerProfileEnvelope(raw)) return fallback;

  const profileRow = raw.profile ?? null;
  const totalXp = Number(profileRow?.total_xp ?? 0);
  const rank = normalizeRank(profileRow?.current_rank ?? null);
  const division = (profileRow?.rank_division ?? "III") as "I" | "II" | "III";

  // Derive tier progress from totalXp. Ranks span 600 XP in the display
  // model (smaller than the MMR span in the engine — totalXp is an
  // absolute accumulator, not MMR). Division progress reads as "21/600",
  // not "0/600 with 21 accumulated" as Board caught in the audit.
  const XP_PER_TIER = 600;
  const currentXp = totalXp % XP_PER_TIER;
  const xpForNext = XP_PER_TIER;

  const studentName =
    raw.child_name?.trim() && raw.child_name.trim() !== "estudante"
      ? raw.child_name.trim()
      : "";

  const achievements: Achievement[] = (raw.achievements ?? []).map((a) => ({
    id: a.achievement_code,
    title: a.achievement_code,
    description: "",
    unlockedAtIso: a.unlocked_at,
  }));

  const inventory: PowerUp[] = (raw.inventory ?? []).map((row) => ({
    id: row.power_up_code,
    name: row.power_up_code,
    description: "",
    charges: row.qty,
  }));

  // Zero-defaults for fields the backend doesn't yet aggregate. These MUST
  // NOT come from `fallback` in prod (see docstring above) — otherwise mock
  // data leaks into the real profile for fresh accounts.
  return {
    studentName,
    title: profileRow?.display_title?.trim() || "Aprendiz",
    totalXp,
    tier: { rank, division },
    currentXp,
    xpForNext,
    streak: {
      days: Number(profileRow?.streak_days ?? 0),
      lastActiveIso: profileRow?.last_active_at ?? "",
    },
    subjects: [],
    activity7d: [0, 0, 0, 0, 0, 0, 0],
    achievements,
    inventory,
  };
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

interface ServerQuestObjective {
  kind?: string;
  target?: number | null;
  progress?: number | null;
}

interface ServerQuestRow {
  id: string;
  subject?: string | null;
  title: string;
  description?: string | null;
  objectives?: ServerQuestObjective[] | null;
  xp_reward?: number | null;
  estimated_minutes?: number | null;
  status?: string | null;
  // Some rows persist a per-quest `completed_at` or derived flags; they're
  // not needed by the UI, so we ignore them here.
}

function isServerQuestRow(value: unknown): value is ServerQuestRow {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.title === "string";
}

function normalizeQuestStatus(raw: string | null | undefined): QuestStatus {
  if (!raw) return "idle";
  const slug = raw.toLowerCase();
  const allowed: QuestStatus[] = [
    "idle",
    "active",
    "completed",
    "expired",
    "defeated",
  ];
  return (allowed as string[]).includes(slug) ? (slug as QuestStatus) : "idle";
}

/**
 * Map the server quest shape (raw `quests` rows + the `objectives` jsonb
 * array defined in gamificationService) into the client `Quest` the
 * QuestCard expects.
 *
 * Previously the client just cast the server response to `Quest[]`, which
 * populated `xpReward`, `estimatedMinutes`, `objectivesDone`, `objectivesTotal`
 * with `undefined` — the UI rendered "+undefined XP", "undefined/undefined",
 * "~undefinedmin". Board caught this live on /estudo for a fresh account.
 *
 * Subject is `null` for daily quests (abstract — "cards_reviewed"). The
 * QuestCard tolerates the null and hides the subject chip in that case.
 */
export function mapServerQuests(raw: unknown): Quest[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row): row is ServerQuestRow => isServerQuestRow(row))
    .map((row) => {
      const objectives = Array.isArray(row.objectives) ? row.objectives : [];
      const objectivesTotal = objectives.reduce(
        (sum, o) => sum + Number(o.target ?? 0),
        0
      );
      const objectivesDone = objectives.reduce(
        (sum, o) => sum + Number(o.progress ?? 0),
        0
      );
      const subject: Subject | null = row.subject
        ? ((SUBJECTS as readonly string[]).includes(row.subject.toLowerCase())
            ? (row.subject.toLowerCase() as Subject)
            : null)
        : null;
      return {
        id: row.id,
        subject,
        title: row.title,
        description: row.description?.trim() || "",
        objectivesDone,
        objectivesTotal: objectivesTotal || 1,
        xpReward: Number(row.xp_reward ?? 0),
        // No server column for estimated minutes yet — use 10 min as a
        // neutral default so the footer reads "~10min" instead of
        // "~undefinedmin".
        estimatedMinutes: Number(row.estimated_minutes ?? 10),
        status: normalizeQuestStatus(row.status),
      };
    });
}

// ---------------------------------------------------------------------------
// Study plan
// ---------------------------------------------------------------------------

interface ServerStudyPlanRow {
  id: string;
  subject?: string | null;
  topic?: string | null;
  exam_date?: string | null;
  created_at?: string | null;
  metadata?: {
    exam_format?: string | null;
  } | null;
}

interface ServerStudyTopicRow {
  id: string;
  title: string;
  order: number;
  mastery_score?: number | null;
  last_reviewed_at?: string | null;
}

interface ServerStudyPlanEnvelope {
  plan?: ServerStudyPlanRow | null;
  topics?: ServerStudyTopicRow[] | null;
}

function isStudyPlanEnvelope(value: unknown): value is ServerStudyPlanEnvelope {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return "plan" in v;
}

function isClientStudyPlan(value: unknown): value is StudyPlan {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    Array.isArray(v.missions) &&
    typeof v.examDateIso === "string"
  );
}

function normalizeSubject(raw: string | null | undefined): Subject {
  if (!raw) return "matematica";
  const slug = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (SUBJECTS as readonly string[]).includes(slug)
    ? (slug as Subject)
    : "matematica";
}

/**
 * Translate `{ plan, topics }` into the client's StudyPlan with missions.
 * Missions are derived from topics in the stored order — we keep the
 * frontend's "abertura → trilha → oficina → ensaio → prova" structural
 * sequence by mapping topic index to mission.kind. If there aren't enough
 * topics to fill every stage we fall back to the mock missions so the
 * UI renders.
 */
export function mapServerStudyPlan(
  raw: unknown,
  fallback: StudyPlan
): StudyPlan {
  if (isClientStudyPlan(raw)) return raw;
  if (!isStudyPlanEnvelope(raw)) return fallback;

  const plan = raw.plan ?? null;
  if (!plan?.id) return fallback;

  const subject = normalizeSubject(plan.subject ?? null);
  const nowIso = new Date().toISOString();
  const examDateIso = plan.exam_date
    ? new Date(plan.exam_date).toISOString()
    : nowIso;
  const createdAtIso = plan.created_at
    ? new Date(plan.created_at).toISOString()
    : nowIso;

  const topics = raw.topics ?? [];

  // Derive missions directly from server topics — no merging of fallback
  // (mock) missions into the real plan. Each topic becomes a mission in
  // stored order; status reflects the stored mastery_score. progress.done
  // starts at 0 for fresh topics (never "4/8" from a fixture).
  const missionKinds: StudyPlan["missions"][number]["kind"][] = [
    "abertura",
    "trilha",
    "oficina",
    "ensaio",
    "prova",
  ];
  const missions: StudyPlan["missions"] = topics.map((topic, idx) => {
    const mastery = Number(topic.mastery_score ?? 0);
    const status: StudyPlan["missions"][number]["status"] =
      mastery >= 0.75 ? "completed" : mastery >= 0.1 ? "active" : "idle";
    const kind = missionKinds[idx] ?? "trilha";
    return {
      id: topic.id,
      kind,
      title: topic.title,
      subtitle: "",
      status,
      progress: { done: 0, total: 1 },
      estimatedMinutes: 20,
    };
  });

  return {
    id: plan.id,
    title: plan.topic?.trim() || "",
    subject,
    examDateIso,
    createdAtIso,
    tier: { rank: "aprendiz", division: "III" },
    missions,
  };
}
