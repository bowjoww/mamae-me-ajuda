/**
 * Flashcard service — AI-backed generation, SM-2 review, next-card selection.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Flashcard,
  FlashcardDifficulty,
  Json,
  Sm2State,
} from "@/lib/supabase/types";
import { readSm2State, schedule, type Sm2Quality } from "./spacedRepetition";
import { askStructured } from "./aiTutor";

// Accept both typed (SupabaseClient<Database>) and untyped clients. Our
// ownership / RLS guarantees still run at the DB; TS strictness here only
// blocks us from writing obviously-wrong shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DBClient = SupabaseClient<any>;

// ---------------------------------------------------------------------------
// AI generation
// ---------------------------------------------------------------------------

const CARD_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string", minLength: 1 },
          hint_chain: {
            type: "array",
            items: { type: "string", minLength: 1 },
            // Socratic chain must always have at least 2 graduated hints — a
            // single hint would either overshoot to the answer or underdeliver.
            // Matches the "2 a 4 dicas SOCRÁTICAS" rule in the user prompt.
            minItems: 2,
            maxItems: 4,
          },
          answer_explanation: { type: "string", minLength: 1 },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
        },
        required: ["question", "hint_chain", "answer_explanation", "difficulty"],
      },
    },
  },
  required: ["cards"],
};

export interface GeneratedCard {
  question: string;
  hint_chain: string[];
  answer_explanation: string;
  difficulty: FlashcardDifficulty;
}

export type FlashcardExamFormat = "discursive" | "multiple-choice" | "mixed";

export async function generateCardsForTopic(req: {
  studentName: string;
  subject: string;
  topicTitle: string;
  count: number;
  examFormat?: FlashcardExamFormat;
}): Promise<GeneratedCard[]> {
  const format = req.examFormat ?? "discursive";

  const formatRules =
    format === "discursive"
      ? [
          "FORMATO DAS QUESTÕES: DISCURSIVO (modelo AV2 Colégio Impacto 7º ano, 10 questões abertas).",
          "- NUNCA use 'qual das alternativas', 'assinale a correta' ou múltipla escolha.",
          "- Use verbos de comando: 'localize', 'descreva', 'reflita', 'calcule', 'explique por que', 'demonstre', 'represente', 'classifique'.",
          "- A question deve exigir DESENVOLVIMENTO ESCRITO do(a) estudante (passo a passo, cálculos, justificativas).",
          "- answer_explanation mostra o raciocínio passo a passo (nunca só a resposta final).",
        ]
      : format === "multiple-choice"
        ? [
            "FORMATO DAS QUESTÕES: MÚLTIPLA ESCOLHA.",
            "- Cada question traz 4-5 alternativas plausíveis dentro do enunciado.",
            "- answer_explanation explica por que a correta vence e por que cada distratora falha.",
          ]
        : [
            "FORMATO DAS QUESTÕES: MISTO (discursivo + múltipla escolha).",
            "- Alterne entre os dois estilos. Prefira discursivo quando o tópico exige cálculo ou demonstração.",
          ];

  const userPrompt = [
    `Gere ${req.count} flashcards socráticos para o(a) estudante ${req.studentName}.`,
    `Matéria: ${req.subject}. Tópico: ${req.topicTitle}.`,
    "",
    ...formatRules,
    "",
    "REGRAS GERAIS (INVIOLÁVEIS):",
    "- question é UMA pergunta clara. NUNCA entregue a resposta junto.",
    "- hint_chain é uma sequência ordenada de 2 a 4 dicas SOCRÁTICAS — cada dica é uma pergunta guiada ou uma pista que convida ao raciocínio, JAMAIS a resposta crua.",
    "- answer_explanation é o 'debrief': mostra o caminho de resolução passo a passo, não apenas o resultado. Só é revelada após o(a) estudante tentar ou pedir explicitamente.",
    "- difficulty: 'easy', 'medium' ou 'hard' baseado no grau de abstração exigido.",
  ].join("\n");

  const { data } = await askStructured<{ cards: GeneratedCard[] }>({
    studentName: req.studentName,
    mode: "estudo",
    userPrompt,
    schemaName: "flashcards_payload",
    jsonSchema: CARD_JSON_SCHEMA,
  });

  return data.cards.slice(0, req.count);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function persistGeneratedCards(
  supabase: DBClient,
  params: {
    parentId: string;
    childId: string;
    topicId: string;
    cards: GeneratedCard[];
  }
): Promise<Flashcard[]> {
  if (params.cards.length === 0) return [];
  // Explicitly stamp sm2_state with a complete shape (incl. due_at). The DB
  // default in migration 006 does the same thing, but setting it here keeps
  // the app behaviour consistent across deployments that haven't rolled that
  // migration yet.
  const initialSm2: Sm2State = {
    ef: 2.5,
    interval: 0,
    repetitions: 0,
    quality: 0,
    due_at: SM2_EPOCH_ZERO,
  };
  const rows = params.cards.map((c) => ({
    parent_id: params.parentId,
    child_id: params.childId,
    topic_id: params.topicId,
    question: c.question,
    hint_chain: c.hint_chain as unknown as Json,
    answer_explanation: c.answer_explanation,
    difficulty: c.difficulty,
    sm2_state: initialSm2 as unknown as Json,
  }));
  const { data, error } = await supabase.from("flashcards").insert(rows).select();
  if (error || !data) return [];
  return data;
}

// ---------------------------------------------------------------------------
// Review + SM-2 persistence
// ---------------------------------------------------------------------------

export interface ReviewOutcome {
  updated: Flashcard | null;
  nextSm2: Sm2State;
  error: string | null;
}

export async function reviewCard(
  supabase: DBClient,
  params: {
    cardId: string;
    quality: Sm2Quality;
    now?: Date;
  }
): Promise<ReviewOutcome> {
  const { data: card, error: readErr } = await supabase
    .from("flashcards")
    .select("*")
    .eq("id", params.cardId)
    .single();

  if (readErr || !card) {
    return { updated: null, nextSm2: emptySm2(), error: readErr?.message ?? "card_not_found" };
  }

  const currentState = readSm2State(card.sm2_state);
  const next = schedule(currentState, params.quality, params.now);

  const newSm2: Sm2State = {
    ef: next.ef,
    interval: next.interval,
    repetitions: next.repetitions,
    quality: next.quality,
    due_at: next.dueAt,
  };

  const { data: updated, error: updateErr } = await supabase
    .from("flashcards")
    .update({ sm2_state: newSm2 as unknown as Json })
    .eq("id", params.cardId)
    .select()
    .single();

  if (updateErr || !updated) {
    return { updated: null, nextSm2: newSm2, error: updateErr?.message ?? "card_update_failed" };
  }

  return { updated, nextSm2: newSm2, error: null };
}

// ---------------------------------------------------------------------------
// Next-card selection — favour due cards, fall back to new ones.
// ---------------------------------------------------------------------------

export async function pickNextCard(
  supabase: DBClient,
  params: {
    childId: string;
    planId?: string;
    now?: Date;
  }
): Promise<Flashcard | null> {
  const nowIso = (params.now ?? new Date()).toISOString();

  // 1) Try an already-due card first.
  let query = supabase
    .from("flashcards")
    .select("*, study_topics!inner(plan_id)")
    .eq("child_id", params.childId)
    .lte("sm2_state->>due_at", nowIso)
    .order("sm2_state->>due_at", { ascending: true })
    .limit(1);
  if (params.planId) {
    query = query.eq("study_topics.plan_id", params.planId);
  }
  const due = await query;
  if (due.data && due.data.length > 0) return due.data[0] as Flashcard;

  // 2) Fall back to a brand-new card (repetitions = 0).
  let q2 = supabase
    .from("flashcards")
    .select("*, study_topics!inner(plan_id)")
    .eq("child_id", params.childId)
    .eq("sm2_state->>repetitions", "0")
    .limit(1);
  if (params.planId) {
    q2 = q2.eq("study_topics.plan_id", params.planId);
  }
  const fresh = await q2;
  if (fresh.data && fresh.data.length > 0) return fresh.data[0] as Flashcard;

  return null;
}

/**
 * Epoch-zero fallback for `due_at`.
 *
 * Why epoch-zero (1970) and not `new Date()`?
 *   * `pickNextCard` runs two queries. The first filters cards whose
 *     `sm2_state->>due_at <= now`. A brand-new card should ALWAYS be eligible
 *     the moment it's created — if we stamped `due_at` with "now" the row
 *     would drop out of the due query by a few milliseconds of clock skew
 *     and the user would see "nenhuma carta" despite just generating one.
 *   * Epoch-zero is a stable, universally-before-now sentinel. No timezone
 *     or DST weirdness.
 *   * The repetitions=0 branch of pickNextCard is the "brand new" fallback;
 *     the due branch now also catches these rows so coverage is complete.
 *
 * The schema in supabase/migrations/006_sm2_due_at_default.sql mirrors this
 * so server-side INSERTs that skip the `sm2_state` column land with the
 * same value.
 */
const SM2_EPOCH_ZERO = "1970-01-01T00:00:00.000Z";

function emptySm2(): Sm2State {
  return {
    ef: 2.5,
    interval: 0,
    repetitions: 0,
    quality: 0,
    due_at: SM2_EPOCH_ZERO,
  };
}
