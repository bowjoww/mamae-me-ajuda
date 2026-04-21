/**
 * @jest-environment node
 *
 * Integration tests for study + gamification routes.
 * Supabase client + OpenAI calls are mocked.
 */
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Supabase mock — chainable query builder supporting .single/.maybeSingle
// and multiple result presets per mock instance.
// ---------------------------------------------------------------------------

type Result = { data: unknown; error: unknown };

interface MockOptions {
  user?: { id: string } | null;
  queryResult?: Result;
  insertResult?: Result;
  updateResult?: Result;
  rpcResult?: Result;
}

function makeSupabaseMock(opts: MockOptions = {}) {
  const {
    user = null,
    queryResult = { data: [], error: null },
    insertResult = { data: null, error: null },
    updateResult = { data: null, error: null },
    rpcResult = { data: 10, error: null },
  } = opts;

  const baseBuilder = () => {
    const state = { insert: false, update: false };
    const b: Record<string, unknown> = {
      select: jest.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      insert: jest.fn(function (this: Record<string, unknown>) {
        state.insert = true;
        return this;
      }),
      update: jest.fn(function (this: Record<string, unknown>) {
        state.update = true;
        return this;
      }),
      delete: jest.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      eq: jest.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      gte: jest.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      lte: jest.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      order: jest.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      limit: jest.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      maybeSingle: jest.fn(() =>
        Promise.resolve(state.insert ? insertResult : state.update ? updateResult : queryResult)
      ),
      single: jest.fn(() =>
        Promise.resolve(state.insert ? insertResult : state.update ? updateResult : queryResult)
      ),
      then: (resolve: (v: Result) => void) =>
        resolve(state.insert ? insertResult : state.update ? updateResult : queryResult),
    };
    return b;
  };

  const client = {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user } }),
    },
    from: jest.fn(() => baseBuilder()),
    rpc: jest.fn().mockResolvedValue(rpcResult),
  };
  return client;
}

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock("@/lib/ratelimit", () => {
  const actual = jest.requireActual("@/lib/ratelimit");
  return {
    ...actual,
    chatRatelimit: null,
    studyPlansRatelimit: null,
    studySessionsRatelimit: null,
    flashcardGenerateRatelimit: null,
    flashcardNextRatelimit: null,
    flashcardReviewRatelimit: null,
    gamificationRatelimit: null,
  };
});

// Mock ai services so we never hit the network.
jest.mock("@/lib/services/aiTutor", () => ({
  askStructured: jest.fn().mockResolvedValue({
    data: { cards: [] },
    modelUsed: "gpt-5.1",
    tokens: { input: 0, output: 0, total: 0 },
  }),
}));
jest.mock("@/lib/services/studyPlanService", () => ({
  createPlanFromIntent: jest.fn().mockResolvedValue({
    plan: { id: "plan-1", subject: "Matemática", topic: "Funções" },
    topics: [],
    error: null,
  }),
  parseStudentIntent: jest.fn(),
}));
jest.mock("@/lib/services/flashcardService", () => ({
  generateCardsForTopic: jest.fn().mockResolvedValue([
    {
      question: "q?",
      hint_chain: ["dica"],
      answer_explanation: "expl",
      difficulty: "medium",
    },
  ]),
  persistGeneratedCards: jest.fn().mockResolvedValue([{ id: "card-1" }]),
  pickNextCard: jest.fn().mockResolvedValue({ id: "card-1" }),
  reviewCard: jest.fn().mockResolvedValue({
    updated: { id: "card-1" },
    nextSm2: { ef: 2.5, interval: 1, repetitions: 1, quality: 5, due_at: "2026-04-21T00:00:00Z" },
    error: null,
  }),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";

// Valid UUID v4s (variant bits 4xxx / 8-b) — Zod 4 enforces RFC 4122.
const CHILD_UUID = "550e8400-e29b-41d4-a716-446655440000";
const PLAN_UUID = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const TOPIC_UUID = "6ba7b811-9dad-41d1-80b4-00c04fd430c8";
const CARD_UUID = "6ba7b812-9dad-41d1-80b4-00c04fd430c8";
const SESSION_UUID = "6ba7b814-9dad-41d1-80b4-00c04fd430c8";

function req(url: string, method = "POST", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// /api/study/plans
// ---------------------------------------------------------------------------

describe("POST /api/study/plans", () => {
  it("returns 401 when not authenticated", async () => {
    const { POST } = await import("../study/plans/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock({ user: null }));
    const res = await POST(
      req("/api/study/plans", "POST", {
        child_id: CHILD_UUID,
        intent: { subject: "Matemática", topic: "Funções", subtopics: [] },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid payload (missing child_id)", async () => {
    const { POST } = await import("../study/plans/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await POST(
      req("/api/study/plans", "POST", { intent: { subject: "x", topic: "y", subtopics: [] } })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on strict schema violation (unknown field)", async () => {
    const { POST } = await import("../study/plans/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await POST(
      req("/api/study/plans", "POST", {
        child_id: CHILD_UUID,
        intent: { subject: "x", topic: "y", subtopics: [] },
        foo: "bar",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when child does not belong to user", async () => {
    const { POST } = await import("../study/plans/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: null, error: null },
      })
    );
    const res = await POST(
      req("/api/study/plans", "POST", {
        child_id: CHILD_UUID,
        intent: { subject: "x", topic: "y", subtopics: [] },
      })
    );
    expect(res.status).toBe(404);
  });

  it("returns 201 on successful creation", async () => {
    const { POST } = await import("../study/plans/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: { id: CHILD_UUID }, error: null },
      })
    );
    const res = await POST(
      req("/api/study/plans", "POST", {
        child_id: CHILD_UUID,
        intent: { subject: "Mat", topic: "Funções", subtopics: [] },
      })
    );
    expect(res.status).toBe(201);
  });
});

describe("GET /api/study/plans", () => {
  it("returns 401 when not authenticated", async () => {
    const { GET } = await import("../study/plans/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock({ user: null }));
    const res = await GET(req("/api/study/plans", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with empty list when authenticated", async () => {
    const { GET } = await import("../study/plans/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" }, queryResult: { data: [], error: null } })
    );
    const res = await GET(req("/api/study/plans", "GET"));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// /api/study/plans/[id]
// ---------------------------------------------------------------------------

describe("PATCH /api/study/plans/[id]", () => {
  it("returns 400 on strict violation", async () => {
    const { PATCH } = await import("../study/plans/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await PATCH(
      req(`/api/study/plans/${PLAN_UUID}`, "PATCH", { bogus: true }),
      { params: Promise.resolve({ id: PLAN_UUID }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 on valid status update", async () => {
    const { PATCH } = await import("../study/plans/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        updateResult: { data: { id: PLAN_UUID, status: "completed" }, error: null },
      })
    );
    const res = await PATCH(
      req(`/api/study/plans/${PLAN_UUID}`, "PATCH", { status: "completed" }),
      { params: Promise.resolve({ id: PLAN_UUID }) }
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// /api/study/sessions
// ---------------------------------------------------------------------------

describe("POST /api/study/sessions", () => {
  it("returns 401 when not authenticated", async () => {
    const { POST } = await import("../study/sessions/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock({ user: null }));
    const res = await POST(req("/api/study/sessions", "POST", { child_id: CHILD_UUID, mode: "estudo" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid mode", async () => {
    const { POST } = await import("../study/sessions/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await POST(
      req("/api/study/sessions", "POST", { child_id: CHILD_UUID, mode: "invalid-mode" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 201 when session is created", async () => {
    const { POST } = await import("../study/sessions/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: { id: CHILD_UUID }, error: null },
        insertResult: { data: { id: SESSION_UUID, mode: "estudo" }, error: null },
      })
    );
    const res = await POST(
      req("/api/study/sessions", "POST", { child_id: CHILD_UUID, mode: "estudo" })
    );
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// /api/study/sessions/[id]/end
// ---------------------------------------------------------------------------

describe("POST /api/study/sessions/[id]/end", () => {
  it("returns 404 when session does not belong to user", async () => {
    const { POST } = await import("../study/sessions/[id]/end/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: null, error: null },
      })
    );
    const res = await POST(
      req(`/api/study/sessions/${SESSION_UUID}/end`, "POST", {
        questions_asked: 5,
        cards_reviewed: 10,
        cards_correct: 7,
        hints_used_total: 4,
        hints_available_total: 20,
      }),
      { params: Promise.resolve({ id: SESSION_UUID }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 on strict schema violation", async () => {
    const { POST } = await import("../study/sessions/[id]/end/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await POST(
      req(`/api/study/sessions/${SESSION_UUID}/end`, "POST", { bogus: true }),
      { params: Promise.resolve({ id: SESSION_UUID }) }
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// /api/study/flashcards/*
// ---------------------------------------------------------------------------

describe("POST /api/study/flashcards/generate", () => {
  it("returns 400 when count > 10", async () => {
    const { POST } = await import("../study/flashcards/generate/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await POST(
      req("/api/study/flashcards/generate", "POST", { topic_id: TOPIC_UUID, count: 99 })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when topic not found", async () => {
    const { POST } = await import("../study/flashcards/generate/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: null, error: null },
      })
    );
    const res = await POST(
      req("/api/study/flashcards/generate", "POST", { topic_id: TOPIC_UUID, count: 3 })
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/study/flashcards/next", () => {
  it("returns 200 with next card", async () => {
    const { POST } = await import("../study/flashcards/next/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: { id: CHILD_UUID }, error: null },
      })
    );
    const res = await POST(
      req("/api/study/flashcards/next", "POST", { child_id: CHILD_UUID, mode: "estudo" })
    );
    expect(res.status).toBe(200);
  });

  it("returns 401 when not authenticated", async () => {
    const { POST } = await import("../study/flashcards/next/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock({ user: null }));
    const res = await POST(
      req("/api/study/flashcards/next", "POST", { child_id: CHILD_UUID, mode: "estudo" })
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/study/flashcards/review", () => {
  it("returns 400 on invalid quality", async () => {
    const { POST } = await import("../study/flashcards/review/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await POST(
      req("/api/study/flashcards/review", "POST", {
        card_id: CARD_UUID,
        quality: 2,
        hints_used: 0,
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when card does not belong to user", async () => {
    const { POST } = await import("../study/flashcards/review/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: null, error: null },
      })
    );
    const res = await POST(
      req("/api/study/flashcards/review", "POST", {
        card_id: CARD_UUID,
        quality: 5,
        hints_used: 0,
      })
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 and awards XP on correct answer with 0 hints", async () => {
    const { POST } = await import("../study/flashcards/review/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: { id: CARD_UUID, child_id: CHILD_UUID }, error: null },
      })
    );
    const res = await POST(
      req("/api/study/flashcards/review", "POST", {
        card_id: CARD_UUID,
        quality: 5,
        hints_used: 0,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.xp_reason).toBe("flashcard_no_hint");
    expect(body.data.xp_awarded).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// /api/gamification/*
// ---------------------------------------------------------------------------

describe("GET /api/gamification/profile", () => {
  it("returns 400 when child_id missing", async () => {
    const { GET } = await import("../gamification/profile/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await GET(req("/api/gamification/profile", "GET"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when child not owned", async () => {
    const { GET } = await import("../gamification/profile/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: null, error: null },
      })
    );
    const res = await GET(
      req(`/api/gamification/profile?child_id=${CHILD_UUID}`, "GET")
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with profile data", async () => {
    const { GET } = await import("../gamification/profile/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: { id: CHILD_UUID, name: "Henrique" }, error: null },
      })
    );
    const res = await GET(
      req(`/api/gamification/profile?child_id=${CHILD_UUID}`, "GET")
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/gamification/quests", () => {
  it("returns 400 when child_id missing", async () => {
    const { GET } = await import("../gamification/quests/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await GET(req("/api/gamification/quests", "GET"));
    expect(res.status).toBe(400);
  });

  it("returns 200 with an (empty) quest list", async () => {
    const { GET } = await import("../gamification/quests/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: { id: CHILD_UUID }, error: null },
      })
    );
    const res = await GET(
      req(`/api/gamification/quests?child_id=${CHILD_UUID}`, "GET")
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /api/gamification/quests/[id]/abandon", () => {
  it("returns 404 when quest not found", async () => {
    const { POST } = await import("../gamification/quests/[id]/abandon/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: null, error: { message: "not found" } },
      })
    );
    const res = await POST(req("/api/gamification/quests/quest-1/abandon"), {
      params: Promise.resolve({ id: "quest-1" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/gamification/power-ups/[code]/use", () => {
  it("returns 404 when child not owned", async () => {
    const { POST } = await import("../gamification/power-ups/[code]/use/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: null, error: null },
      })
    );
    const res = await POST(
      req("/api/gamification/power-ups/dica_extra/use", "POST", {
        child_id: CHILD_UUID,
      }),
      { params: Promise.resolve({ code: "dica_extra" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 on strict violation", async () => {
    const { POST } = await import("../gamification/power-ups/[code]/use/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await POST(
      req("/api/gamification/power-ups/dica_extra/use", "POST", { bogus: 1 }),
      { params: Promise.resolve({ code: "dica_extra" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const { POST } = await import("../gamification/power-ups/[code]/use/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock({ user: null }));
    const res = await POST(
      req("/api/gamification/power-ups/dica_extra/use", "POST", { child_id: CHILD_UUID }),
      { params: Promise.resolve({ code: "dica_extra" }) }
    );
    expect(res.status).toBe(401);
  });

  it("calls consume_power_up RPC atomically (no SELECT+UPDATE race)", async () => {
    const { POST } = await import("../gamification/power-ups/[code]/use/route");
    const mock = makeSupabaseMock({
      user: { id: "u1" },
      queryResult: { data: { id: CHILD_UUID }, error: null },
      rpcResult: {
        data: [{ inventory_id: "inv-1", remaining_qty: 2 }],
        error: null,
      },
    });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(mock);
    const res = await POST(
      req("/api/gamification/power-ups/dica_extra/use", "POST", { child_id: CHILD_UUID }),
      { params: Promise.resolve({ code: "dica_extra" }) }
    );
    expect(res.status).toBe(200);
    // Proof: atomic RPC is called (not legacy SELECT+UPDATE pattern).
    expect(mock.rpc).toHaveBeenCalledWith(
      "consume_power_up",
      expect.objectContaining({ p_child_id: CHILD_UUID, p_code: "dica_extra" })
    );
    const body = await res.json();
    expect(body.data.consumed).toBe("dica_extra");
    expect(body.data.remaining).toBe(2);
  });

  it("returns 404 when RPC returns empty (qty was already 0)", async () => {
    const { POST } = await import("../gamification/power-ups/[code]/use/route");
    const mock = makeSupabaseMock({
      user: { id: "u1" },
      queryResult: { data: { id: CHILD_UUID }, error: null },
      rpcResult: { data: [], error: null },
    });
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(mock);
    const res = await POST(
      req("/api/gamification/power-ups/dica_extra/use", "POST", { child_id: CHILD_UUID }),
      { params: Promise.resolve({ code: "dica_extra" }) }
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Extra branch-coverage tests for routes that have multiple early returns
// ---------------------------------------------------------------------------

describe("routes — unauthenticated branches", () => {
  it("GET /api/study/plans/[id] returns 401 unauthed", async () => {
    const { GET } = await import("../study/plans/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock({ user: null }));
    const res = await GET(req(`/api/study/plans/${PLAN_UUID}`), {
      params: Promise.resolve({ id: PLAN_UUID }),
    });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/study/plans/[id] returns 401 unauthed", async () => {
    const { DELETE } = await import("../study/plans/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock({ user: null }));
    const res = await DELETE(req(`/api/study/plans/${PLAN_UUID}`, "DELETE"), {
      params: Promise.resolve({ id: PLAN_UUID }),
    });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/study/plans/[id] returns 401 unauthed", async () => {
    const { PATCH } = await import("../study/plans/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock({ user: null }));
    const res = await PATCH(
      req(`/api/study/plans/${PLAN_UUID}`, "PATCH", { status: "completed" }),
      { params: Promise.resolve({ id: PLAN_UUID }) }
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/gamification/quests returns 401 unauthed", async () => {
    const { GET } = await import("../gamification/quests/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock({ user: null }));
    const res = await GET(req("/api/gamification/quests?child_id=" + CHILD_UUID));
    expect(res.status).toBe(401);
  });

  it("POST /api/gamification/quests/[id]/abandon returns 401 unauthed", async () => {
    const { POST } = await import("../gamification/quests/[id]/abandon/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock({ user: null }));
    const res = await POST(req("/api/gamification/quests/q1/abandon"), {
      params: Promise.resolve({ id: "q1" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/study/sessions/[id]/end returns 401 unauthed", async () => {
    const { POST } = await import("../study/sessions/[id]/end/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock({ user: null }));
    const res = await POST(
      req(`/api/study/sessions/${SESSION_UUID}/end`, "POST", {}),
      { params: Promise.resolve({ id: SESSION_UUID }) }
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/study/flashcards/generate returns 401 unauthed", async () => {
    const { POST } = await import("../study/flashcards/generate/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(makeSupabaseMock({ user: null }));
    const res = await POST(
      req("/api/study/flashcards/generate", "POST", { topic_id: TOPIC_UUID, count: 3 })
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/study/plans/[id] returns 200 when plan exists", async () => {
    const { GET } = await import("../study/plans/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: { id: PLAN_UUID }, error: null },
      })
    );
    const res = await GET(req(`/api/study/plans/${PLAN_UUID}`), {
      params: Promise.resolve({ id: PLAN_UUID }),
    });
    expect(res.status).toBe(200);
  });

  it("DELETE /api/study/plans/[id] returns 200 on success", async () => {
    const { DELETE } = await import("../study/plans/[id]/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: null, error: null },
      })
    );
    const res = await DELETE(req(`/api/study/plans/${PLAN_UUID}`, "DELETE"), {
      params: Promise.resolve({ id: PLAN_UUID }),
    });
    expect(res.status).toBe(200);
  });
});
