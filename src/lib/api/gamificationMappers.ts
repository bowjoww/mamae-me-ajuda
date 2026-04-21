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
 * When the server passes back a null/undefined `profile` (the child has no
 * user_profile row yet — fresh account), we fall back to the mock so the UI
 * doesn't crash, but the totalXp defaults to 0 so nothing lies about activity.
 */
export function mapServerProfile(raw: unknown, fallback: Profile): Profile {
  if (isClientProfile(raw)) return raw;
  if (!isServerProfileEnvelope(raw)) return fallback;

  const profileRow = raw.profile ?? null;
  const totalXp = Number(profileRow?.total_xp ?? 0);
  const rank = normalizeRank(profileRow?.current_rank ?? null);
  const division = (profileRow?.rank_division ?? "III") as "I" | "II" | "III";

  const studentName =
    raw.child_name?.trim() || fallback.studentName || "estudante";

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

  // Subjects and activity7d aren't exposed by the backend yet — keep the
  // fallback values so the HUD has something to render. This is honest when
  // the fallback is the zero-activity empty state; when it's a seeded mock
  // it signals to the player that the progress view is a work in progress
  // rather than a lie about their actual XP.
  return {
    studentName,
    title: profileRow?.display_title?.trim() || fallback.title,
    totalXp,
    tier: { rank, division },
    currentXp: fallback.currentXp,
    xpForNext: fallback.xpForNext,
    streak: {
      days: Number(profileRow?.streak_days ?? 0),
      lastActiveIso: profileRow?.last_active_at ?? fallback.streak.lastActiveIso,
    },
    subjects: fallback.subjects,
    activity7d: fallback.activity7d,
    achievements: achievements.length > 0 ? achievements : fallback.achievements,
    inventory: inventory.length > 0 ? inventory : fallback.inventory,
  };
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
  const examDateIso = plan.exam_date
    ? new Date(plan.exam_date).toISOString()
    : fallback.examDateIso;
  const createdAtIso = plan.created_at
    ? new Date(plan.created_at).toISOString()
    : fallback.createdAtIso;

  const topics = raw.topics ?? [];

  // For now we map topics 1:1 onto the fallback missions' visual scaffolding.
  // When the backend gains per-topic progress we can flip `status` from
  // idle → active/completed from the mastery_score threshold.
  const missions = fallback.missions.map((m, idx) => {
    const topic = topics[idx];
    if (!topic) return m;
    const mastery = Number(topic.mastery_score ?? 0);
    const status: StudyPlan["missions"][number]["status"] =
      mastery >= 0.75 ? "completed" : mastery >= 0.1 ? "active" : "idle";
    return {
      ...m,
      title: topic.title.length > 40 ? m.title : topic.title,
      subtitle: m.subtitle,
      status,
    };
  });

  return {
    id: plan.id,
    title: plan.topic?.trim() || fallback.title,
    subject,
    examDateIso,
    createdAtIso,
    tier: fallback.tier,
    missions,
  };
}
