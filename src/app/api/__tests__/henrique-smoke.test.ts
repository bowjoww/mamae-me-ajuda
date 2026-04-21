/**
 * @jest-environment node
 *
 * End-to-end smoke test for Henrique (user zero).
 *
 * Scenario (real data):
 *   - Student: Henrique, Colégio Impacto, 7º ano
 *   - Subject: Matemática — Plano Cartesiano e Simetrias (Cap. 3)
 *   - Exam: AV2 discursiva, 10 questões, 23/04/2026 (quinta-feira)
 *
 * What this proves:
 *   1. POST /api/study/plans accepts an intent carrying exam_format: "discursive"
 *      and persists it to plan.metadata.exam_format.
 *   2. POST /api/study/flashcards/generate reads plan.metadata.exam_format and
 *      forwards it to the AI call, forcing the discursive-style prompt. The
 *      generated card shape still guarantees hint_chain (Socratic) + a
 *      separate answer_explanation (no raw answer in the question).
 *   3. POST /api/study/flashcards/review awards exactly 15 XP when
 *      hints_used=0 and quality=5 (matches the XP_TABLE invariant).
 *   4. GET /api/gamification/profile returns the updated total_xp after review.
 *
 * All DB + AI calls are mocked — we assert CONTRACTS, not network behavior.
 */
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Henrique's canonical payload
// ---------------------------------------------------------------------------

// Valid RFC 4122 v4 UUIDs (required by Zod's strict uuid validator).
const HENRIQUE = {
  parentId: "11111111-1111-4111-8111-111111111111",
  childId: "22222222-2222-4222-8222-222222222222",
  planId: "33333333-3333-4333-8333-333333333333",
  topicId: "44444444-4444-4444-8444-444444444444",
  cardId: "55555555-5555-4555-8555-555555555555",
  studentName: "Henrique",
};

const HENRIQUE_INTENT = {
  subject: "Matemática",
  topic: "Plano Cartesiano e Simetrias",
  exam_date: "2026-04-23",
  exam_format: "discursive" as const,
  subtopics: [
    { title: "Revisar coordenadas do plano cartesiano", estimated_minutes: 25 },
    { title: "Simetria axial (reflexão em eixos)", estimated_minutes: 30 },
    { title: "Simetria central (rotação 180°)", estimated_minutes: 25 },
    { title: "Aplicações práticas em triângulos", estimated_minutes: 35 },
    { title: "Simulado final — 5 questões discursivas", estimated_minutes: 45 },
  ],
};

// ---------------------------------------------------------------------------
// Mock Supabase + OpenAI layer
// ---------------------------------------------------------------------------

type Result = { data: unknown; error: unknown };

interface BuilderState {
  insert: boolean;
  update: boolean;
}

function makeSupabase(opts: {
  user?: { id: string } | null;
  tables: Record<string, Result>;
  inserts?: Record<string, Result>;
  rpc?: Result;
}) {
  const { user = null, tables, inserts = {}, rpc = { data: 15, error: null } } = opts;
  const queryLog: Array<{ table: string; op: "select" | "insert" | "update"; payload?: unknown }> =
    [];

  const builder = (table: string) => {
    const state: BuilderState = { insert: false, update: false };
    let lastInsertPayload: unknown;
    const b: Record<string, unknown> = {
      select: jest.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      insert: jest.fn(function (this: Record<string, unknown>, payload: unknown) {
        state.insert = true;
        lastInsertPayload = payload;
        queryLog.push({ table, op: "insert", payload });
        return this;
      }),
      update: jest.fn(function (this: Record<string, unknown>, payload: unknown) {
        state.update = true;
        queryLog.push({ table, op: "update", payload });
        return this;
      }),
      delete: jest.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      eq: jest.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      order: jest.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      limit: jest.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      maybeSingle: jest.fn(() =>
        Promise.resolve(
          state.insert
            ? inserts[table] ?? tables[table]
            : state.update
              ? inserts[table] ?? tables[table]
              : tables[table]
        )
      ),
      single: jest.fn(() =>
        Promise.resolve(
          state.insert
            ? inserts[table] ?? tables[table]
            : state.update
              ? inserts[table] ?? tables[table]
              : tables[table]
        )
      ),
      then: (resolve: (v: Result) => void) =>
        resolve(
          state.insert
            ? inserts[table] ?? tables[table]
            : state.update
              ? inserts[table] ?? tables[table]
              : tables[table]
        ),
      _getLastInsert: () => lastInsertPayload,
    };
    return b;
  };

  const usedBuilders: Record<string, ReturnType<typeof builder>> = {};

  const client = {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user } }),
    },
    from: jest.fn((table: string) => {
      const b = builder(table);
      usedBuilders[table] = b;
      return b;
    }),
    rpc: jest.fn().mockResolvedValue(rpc),
    _queryLog: queryLog,
    _builders: usedBuilders,
  };
  return client;
}

// ---------------------------------------------------------------------------
// Module mocks wired before importing route handlers
// ---------------------------------------------------------------------------

let supabaseFactory: () => unknown = () => ({});

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(() => Promise.resolve(supabaseFactory())),
}));

jest.mock("@/lib/ratelimit", () => ({
  chatRatelimit: null,
  studyPlansRatelimit: null,
  studySessionsRatelimit: null,
  flashcardGenerateRatelimit: null,
  flashcardNextRatelimit: null,
  flashcardReviewRatelimit: null,
  gamificationRatelimit: null,
  getClientIp: () => "127.0.0.1",
}));

const mockAskStructured = jest.fn();
jest.mock("@/lib/services/aiTutor", () => ({
  askStructured: (...args: unknown[]) => mockAskStructured(...args),
  askTutor: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function req(url: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getReq(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "GET",
  });
}

// ---------------------------------------------------------------------------
// Route handlers (imported lazily AFTER mocks are wired)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-require-imports */
const plansRoute = require("../study/plans/route") as typeof import("../study/plans/route");
const flashcardsGenerateRoute =
  require("../study/flashcards/generate/route") as typeof import("../study/flashcards/generate/route");
const flashcardsReviewRoute =
  require("../study/flashcards/review/route") as typeof import("../study/flashcards/review/route");
const profileRoute =
  require("../gamification/profile/route") as typeof import("../gamification/profile/route");
/* eslint-enable @typescript-eslint/no-require-imports */

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Henrique — end-to-end smoke (Cap. 3 / AV2 discursivo)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAskStructured.mockReset();
  });

  it("Step 1 — POST /api/study/plans persists exam_format=discursive in metadata", async () => {
    const supabase = makeSupabase({
      user: { id: HENRIQUE.parentId },
      tables: {
        children: { data: { id: HENRIQUE.childId }, error: null },
        study_plans: {
          data: {
            id: HENRIQUE.planId,
            parent_id: HENRIQUE.parentId,
            child_id: HENRIQUE.childId,
            subject: HENRIQUE_INTENT.subject,
            topic: HENRIQUE_INTENT.topic,
            exam_date: HENRIQUE_INTENT.exam_date,
            status: "active",
            metadata: {
              exam_format: "discursive",
              exam_sample_photo_url: null,
              estimated_minutes_total: 160,
            },
          },
          error: null,
        },
        study_topics: {
          data: HENRIQUE_INTENT.subtopics.map((s, i) => ({
            id: `topic-${i}`,
            plan_id: HENRIQUE.planId,
            title: s.title,
            order: i,
          })),
          error: null,
        },
      },
      inserts: {
        study_plans: {
          data: {
            id: HENRIQUE.planId,
            parent_id: HENRIQUE.parentId,
            child_id: HENRIQUE.childId,
            subject: HENRIQUE_INTENT.subject,
            topic: HENRIQUE_INTENT.topic,
            exam_date: HENRIQUE_INTENT.exam_date,
            status: "active",
            metadata: {
              exam_format: "discursive",
              exam_sample_photo_url: null,
              estimated_minutes_total: 160,
            },
          },
          error: null,
        },
        study_topics: {
          data: HENRIQUE_INTENT.subtopics.map((s, i) => ({
            id: `topic-${i}`,
            plan_id: HENRIQUE.planId,
            title: s.title,
            order: i,
          })),
          error: null,
        },
      },
    });
    supabaseFactory = () => supabase;

    const response = await plansRoute.POST(
      req("/api/study/plans", {
        child_id: HENRIQUE.childId,
        intent: HENRIQUE_INTENT,
      })
    );

    expect(response.status).toBe(201);
    const json = await response.json();

    // Proof: the plan exists with Henrique's subject / topic / exam_date
    expect(json.data.plan.subject).toBe("Matemática");
    expect(json.data.plan.topic).toBe("Plano Cartesiano e Simetrias");
    expect(json.data.plan.exam_date).toBe("2026-04-23");
    expect(json.data.plan.metadata.exam_format).toBe("discursive");

    // Proof: 5 subtopics were accepted
    expect(json.data.topics).toHaveLength(5);

    // Proof: the persisted metadata carries the exam_format flag
    const insertCall = (
      supabase._builders["study_plans"] as { _getLastInsert: () => unknown }
    )._getLastInsert() as { metadata: { exam_format: string } };
    expect(insertCall.metadata.exam_format).toBe("discursive");
  });

  it("Step 2 — POST /api/study/flashcards/generate feeds exam_format to AI and persists Socratic cards", async () => {
    // AI returns 5 discursive cards (verbs-of-command, stepwise debriefs)
    const discursiveCards = [
      {
        question:
          "Localize no plano cartesiano o ponto P(3, -2) e descreva em qual quadrante ele se encontra. Justifique a partir dos sinais das coordenadas.",
        hint_chain: [
          "Que papel cada coordenada (x, y) tem na localização do ponto?",
          "Quando x é positivo e y é negativo, o ponto fica acima ou abaixo do eixo x?",
          "Lembra como os quadrantes são numerados? Comece pelo I e siga no sentido anti-horário.",
        ],
        answer_explanation:
          "Passo 1: x=3 indica deslocamento de 3 unidades à direita da origem. Passo 2: y=-2 indica 2 unidades para baixo. Passo 3: como x>0 e y<0, o ponto está no IV quadrante.",
        difficulty: "easy",
      },
      {
        question:
          "Reflita o triângulo ABC de vértices A(2,1), B(5,1) e C(4,4) em relação ao eixo y. Represente as novas coordenadas A', B' e C' e descreva o que muda.",
        hint_chain: [
          "Quando refletimos um ponto em relação ao eixo y, qual coordenada muda de sinal?",
          "Escreva A', B' e C' lado a lado com seus originais. O que observa?",
        ],
        answer_explanation:
          "Passo 1: reflexão em y inverte o sinal de x. Passo 2: A'(-2,1), B'(-5,1), C'(-4,4). Passo 3: a figura preserva tamanho e forma, só inverte a orientação.",
        difficulty: "medium",
      },
      {
        question:
          "Descreva a simetria central (rotação de 180°) do ponto Q(-3, 5) em relação à origem. Mostre o cálculo passo a passo.",
        hint_chain: [
          "Numa simetria central em relação à origem, o que acontece com ambas as coordenadas?",
          "Some o ponto original e o simétrico — o que você espera que dê?",
        ],
        answer_explanation:
          "Passo 1: simetria central inverte os dois sinais. Passo 2: Q'(3,-5). Passo 3: verificação: Q + Q' = (0,0), confirmando a simetria em relação à origem.",
        difficulty: "medium",
      },
      {
        question:
          "Calcule a distância entre os pontos M(1,2) e N(4,6) e explique o raciocínio usado.",
        hint_chain: [
          "Que teorema da geometria plana relaciona duas distâncias perpendiculares com a hipotenusa?",
          "Quanto é a diferença em x? E em y? Essas são os catetos de qual triângulo?",
        ],
        answer_explanation:
          "Passo 1: Δx = 4-1 = 3. Passo 2: Δy = 6-2 = 4. Passo 3: distância = raiz(3² + 4²) = raiz(25) = 5.",
        difficulty: "medium",
      },
      {
        question:
          "Represente graficamente a reta que liga os pontos R(-2,0) e S(2,4) e explique como encontrar o ponto médio entre eles.",
        hint_chain: [
          "Como se calcula a média de dois valores?",
          "Se aplicarmos essa ideia para x e y separadamente, o que encontramos?",
        ],
        answer_explanation:
          "Passo 1: médio em x = (-2+2)/2 = 0. Passo 2: médio em y = (0+4)/2 = 2. Passo 3: ponto médio = (0,2). Representar desenhando a reta passando por ambos e marcando (0,2) no meio.",
        difficulty: "hard",
      },
    ];

    mockAskStructured.mockResolvedValueOnce({
      data: { cards: discursiveCards },
      modelUsed: "gpt-5.1",
      tokens: { input: 1200, output: 800, total: 2000 },
    });

    const supabase = makeSupabase({
      user: { id: HENRIQUE.parentId },
      tables: {
        study_topics: {
          data: {
            id: HENRIQUE.topicId,
            title: "Revisar coordenadas do plano cartesiano",
            plan_id: HENRIQUE.planId,
            study_plans: {
              id: HENRIQUE.planId,
              subject: "Matemática",
              child_id: HENRIQUE.childId,
              parent_id: HENRIQUE.parentId,
              metadata: { exam_format: "discursive" },
            },
          },
          error: null,
        },
        children: { data: { name: HENRIQUE.studentName }, error: null },
        flashcards: {
          data: discursiveCards.map((c, i) => ({
            id: `card-${i}`,
            parent_id: HENRIQUE.parentId,
            child_id: HENRIQUE.childId,
            topic_id: HENRIQUE.topicId,
            question: c.question,
            hint_chain: c.hint_chain,
            answer_explanation: c.answer_explanation,
            difficulty: c.difficulty,
          })),
          error: null,
        },
      },
      inserts: {
        flashcards: {
          data: discursiveCards.map((c, i) => ({
            id: `card-${i}`,
            parent_id: HENRIQUE.parentId,
            child_id: HENRIQUE.childId,
            topic_id: HENRIQUE.topicId,
            question: c.question,
            hint_chain: c.hint_chain,
            answer_explanation: c.answer_explanation,
            difficulty: c.difficulty,
          })),
          error: null,
        },
      },
    });
    supabaseFactory = () => supabase;

    const response = await flashcardsGenerateRoute.POST(
      req("/api/study/flashcards/generate", { topic_id: HENRIQUE.topicId, count: 5 })
    );

    expect(response.status).toBe(201);
    const json = await response.json();

    // Proof: 5 cards persisted
    expect(json.data).toHaveLength(5);

    // Proof: AI received discursive format in the user prompt
    expect(mockAskStructured).toHaveBeenCalledTimes(1);
    const promptArg = mockAskStructured.mock.calls[0][0];
    expect(promptArg.userPrompt).toMatch(/DISCURSIVO/);
    expect(promptArg.userPrompt).toMatch(/AV2/);
    // Proof: the socratic contract is in the prompt
    expect(promptArg.userPrompt).toMatch(/INVIOLÁVEIS/);
    expect(promptArg.userPrompt).toMatch(/hint_chain/);

    // Proof: every card follows the Socratic contract
    for (const card of json.data) {
      expect(card.question.length).toBeGreaterThan(20);
      // Question uses discursive command verbs, NOT multiple-choice wording
      expect(card.question).not.toMatch(/qual das alternativas/i);
      expect(card.question).not.toMatch(/assinale a correta/i);
      expect(card.question).toMatch(
        /localize|descreva|reflita|calcule|represente|explique|demonstre|classifique/i
      );
      // hint_chain is a non-empty array of socratic questions
      expect(Array.isArray(card.hint_chain)).toBe(true);
      expect(card.hint_chain.length).toBeGreaterThanOrEqual(2);
      // answer_explanation is stepwise (contains "Passo" markers)
      expect(card.answer_explanation).toMatch(/Passo/);
    }
  });

  it("Step 3 — POST /api/study/flashcards/review awards 15 XP with hints_used=0, quality=5", async () => {
    const supabase = makeSupabase({
      user: { id: HENRIQUE.parentId },
      tables: {
        flashcards: {
          data: {
            id: HENRIQUE.cardId,
            child_id: HENRIQUE.childId,
            sm2_state: { ef: 2.5, interval: 0, repetitions: 0 },
          },
          error: null,
        },
      },
      inserts: {
        flashcards: {
          data: {
            id: HENRIQUE.cardId,
            child_id: HENRIQUE.childId,
            sm2_state: { ef: 2.6, interval: 1, repetitions: 1 },
          },
          error: null,
        },
      },
      rpc: { data: 15, error: null }, // award_xp returns new total 15
    });
    supabaseFactory = () => supabase;

    const response = await flashcardsReviewRoute.POST(
      req("/api/study/flashcards/review", {
        card_id: HENRIQUE.cardId,
        quality: 5,
        hints_used: 0,
        read_debrief: false,
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();

    // Proof: exactly 15 XP awarded (flashcard_no_hint)
    expect(json.data.xp_awarded).toBe(15);
    expect(json.data.xp_reason).toBe("flashcard_no_hint");

    // Proof: award_xp RPC was called with the matching delta + reason
    expect(supabase.rpc).toHaveBeenCalledWith(
      "award_xp",
      expect.objectContaining({
        p_child_id: HENRIQUE.childId,
        p_delta: 15,
        p_reason: "flashcard_no_hint",
      })
    );
  });

  it("Step 3b — hints_used=1 awards 10 XP, hints_used=2 awards 6 XP (flat Socratic scale)", async () => {
    for (const [hintsUsed, expectedXp, expectedReason] of [
      [1, 10, "flashcard_1_hint"],
      [2, 6, "flashcard_2plus_hints"],
    ] as const) {
      const supabase = makeSupabase({
        user: { id: HENRIQUE.parentId },
        tables: {
          flashcards: {
            data: {
              id: HENRIQUE.cardId,
              child_id: HENRIQUE.childId,
              sm2_state: { ef: 2.5, interval: 0, repetitions: 0 },
            },
            error: null,
          },
        },
        inserts: {
          flashcards: {
            data: {
              id: HENRIQUE.cardId,
              child_id: HENRIQUE.childId,
              sm2_state: { ef: 2.6, interval: 1, repetitions: 1 },
            },
            error: null,
          },
        },
        rpc: { data: expectedXp, error: null },
      });
      supabaseFactory = () => supabase;

      const response = await flashcardsReviewRoute.POST(
        req("/api/study/flashcards/review", {
          card_id: HENRIQUE.cardId,
          quality: 5,
          hints_used: hintsUsed,
          read_debrief: false,
        })
      );
      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json.data.xp_awarded).toBe(expectedXp);
      expect(json.data.xp_reason).toBe(expectedReason);
    }
  });

  it("Step 4 — GET /api/gamification/profile returns updated XP after reviews", async () => {
    const supabase = makeSupabase({
      user: { id: HENRIQUE.parentId },
      tables: {
        children: { data: { id: HENRIQUE.childId, name: HENRIQUE.studentName }, error: null },
        user_profile: {
          data: {
            child_id: HENRIQUE.childId,
            total_xp: 15,
            level: 1,
            mmr: 0,
            rank: "Aprendiz",
            division: "III",
          },
          error: null,
        },
        user_achievements: { data: [], error: null },
        user_inventory: { data: [], error: null },
      },
    });
    supabaseFactory = () => supabase;

    const response = await profileRoute.GET(
      getReq(`/api/gamification/profile?child_id=${HENRIQUE.childId}`)
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.profile.total_xp).toBe(15);
    expect(json.data.child_name).toBe(HENRIQUE.studentName);
  });
});
