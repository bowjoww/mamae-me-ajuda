/**
 * Domain types for the gamification layer.
 *
 * Shape agreed with Game Designer (7 ranks, divisions, XP ledger) and wired
 * to the backend contract in Supabase (migration 003 + rebrand 004).
 *
 * Thematic note: these names replaced the original esports-tactical vocabulary
 * (Recruta/Operador/Analista/Tático/Estrategista/Mentor/Arquimestre — see
 * migration 004_rebrand_ranks) with an exploration/crafting tone that matches
 * the real player persona — someone who plays sandbox and survival games, not
 * shooters. The engine math (MMR weights, XP table, SM-2) is untouched: only
 * labels and lore strings changed.
 */

export const RANKS = [
  "aprendiz",
  "batedor",
  "explorador",
  "coletor",
  "artesao",
  "cartografo",
  "mestre",
] as const;

export type Rank = (typeof RANKS)[number];

export type Division = "III" | "II" | "I";

export const SUBJECTS = [
  "matematica",
  "portugues",
  "ciencias",
  "historia",
  "geografia",
  "ingles",
] as const;

export type Subject = (typeof SUBJECTS)[number];

export const SUBJECT_LABEL: Record<Subject, string> = {
  matematica: "Matemática",
  portugues: "Português",
  ciencias: "Ciências",
  historia: "História",
  geografia: "Geografia",
  ingles: "Inglês",
};

export const RANK_LABEL: Record<Rank, string> = {
  aprendiz: "Aprendiz",
  batedor: "Batedor",
  explorador: "Explorador",
  coletor: "Coletor",
  artesao: "Artesão",
  cartografo: "Cartógrafo",
  mestre: "Mestre",
};

/**
 * Rank metadata — label, CSS color token, and a one-line lore string shown
 * on the profile surface. The tone is Don't Starve diary, not military
 * report: honest, observational, light on adjectives.
 */
export interface RankMeta {
  label: string;
  color: string;
  lore: string;
}

export const RANK_META: Record<Rank, RankMeta> = {
  aprendiz: {
    label: "Aprendiz",
    color: "var(--rank-aprendiz)",
    lore: "Aprendiz — ainda está juntando os primeiros ingredientes.",
  },
  batedor: {
    label: "Batedor",
    color: "var(--rank-batedor)",
    lore: "Batedor — já lê mapa sozinho e sabe quando voltar.",
  },
  explorador: {
    label: "Explorador",
    color: "var(--rank-explorador)",
    lore: "Explorador — caminha longe, anota o que encontra.",
  },
  coletor: {
    label: "Coletor",
    color: "var(--rank-coletor)",
    lore: "Coletor — sabe separar pedra boa de pedra qualquer.",
  },
  artesao: {
    label: "Artesão",
    color: "var(--rank-artesao)",
    lore: "Artesão — transforma o que coletou em algo útil.",
  },
  cartografo: {
    label: "Cartógrafo",
    color: "var(--rank-cartografo)",
    lore: "Cartógrafo — desenha o caminho pros que vêm depois.",
  },
  mestre: {
    label: "Mestre",
    color: "var(--rank-mestre)",
    lore: "Mestre — ensina, constrói, segue andando.",
  },
};

/**
 * Typed lookup. Accepts the canonical lowercase slug or a legacy PT label
 * ("Aprendiz", "Batedor", ...) for compatibility with server-side rows that
 * store the display name directly in `user_profile.current_rank`.
 */
export function getRankMeta(rank: Rank | string): RankMeta {
  if (rank in RANK_META) {
    return RANK_META[rank as Rank];
  }
  // Accept PT display labels: "Aprendiz", "Batedor", ...
  const lower = rank.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (lower in RANK_META) {
    return RANK_META[lower as Rank];
  }
  // Safe default — never throw from a rendering path.
  return RANK_META.aprendiz;
}

export interface TierBadgeData {
  rank: Rank;
  division: Division;
}

export interface SubjectProgress {
  subject: Subject;
  tier: TierBadgeData;
  currentXp: number;
  xpForNext: number;
}

export interface Streak {
  days: number;
  lastActiveIso: string;
}

export interface Profile {
  studentName: string;
  title: string;
  totalXp: number;
  tier: TierBadgeData;
  currentXp: number;
  xpForNext: number;
  streak: Streak;
  subjects: SubjectProgress[];
  activity7d: number[]; // heatmap: 7 ints, each = minutes studied
  achievements: Achievement[];
  inventory: PowerUp[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlockedAtIso: string | null; // null = locked
  subject?: Subject;
}

export interface PowerUp {
  id: string;
  name: string;
  description: string;
  charges: number;
}

export type QuestStatus =
  | "idle"
  | "active"
  | "completed"
  | "expired"
  | "defeated";

export interface Quest {
  id: string;
  subject: Subject;
  title: string;
  description: string;
  objectivesDone: number;
  objectivesTotal: number;
  xpReward: number;
  estimatedMinutes: number;
  status: QuestStatus;
  featured?: boolean;
}

export type FlashcardGrade = "errei" | "quase" | "acertei";

export interface Flashcard {
  id: string;
  subject: Subject;
  topic: string;
  front: string;
  back: string;
}

export type TopicMastery = "new" | "progress" | "mastered";

export interface TopicRow {
  topic: string;
  subject: Subject;
  mastery: TopicMastery;
  lastStudiedIso: string | null;
}

/**
 * Stages of an Expedição (study plan). The kinds keep the same structural
 * meaning as before (briefing → recon → training → simulated → boss) but
 * their spoken labels now sit inside an exploration frame, not a combat one.
 *
 * - "abertura":    mapear o que cai, entender o formato da Prova
 * - "trilha":      caminhar pelos tópicos e reconhecer terreno
 * - "oficina":     treinar com exercícios guiados
 * - "ensaio":      simulado no formato da Prova real
 * - "prova":       a Prova da escola (o teste real)
 */
export type MissionKind = "abertura" | "trilha" | "oficina" | "ensaio" | "prova";

export interface Mission {
  id: string;
  kind: MissionKind;
  title: string;
  subtitle: string;
  status: QuestStatus;
  progress: { done: number; total: number };
  estimatedMinutes: number;
}

export interface StudyPlan {
  id: string;
  title: string;
  subject: Subject;
  examDateIso: string;
  createdAtIso: string;
  tier: TierBadgeData;
  missions: Mission[];
}
