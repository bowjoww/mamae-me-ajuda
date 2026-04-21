/**
 * @jest-environment node
 *
 * Smoke tests for the three routes added during the frontend-backend wire-up:
 *   - GET  /api/children/primary
 *   - POST /api/study/plans/from-utterance
 *   - GET  /api/gamification/topics
 *
 * Each route is exercised against a chainable Supabase mock identical to
 * the pattern used in study-routes.test.ts so we can assert status codes
 * without touching the network.
 */
import { NextRequest } from "next/server";

type Result = { data: unknown; error: unknown };

interface MockOptions {
  user?: { id: string } | null;
  queryResult?: Result;
  insertResult?: Result;
  updateResult?: Result;
  orderResult?: Result;
}

function makeSupabaseMock(opts: MockOptions = {}) {
  const {
    user = null,
    queryResult = { data: [], error: null },
    insertResult = { data: null, error: null },
    updateResult = { data: null, error: null },
    orderResult,
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
      order: jest.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      limit: jest.fn(function (this: Record<string, unknown>) {
        // When the caller awaits directly after .limit(), resolve with the
        // orderResult override (mirrors `.from(...).select().eq().order().limit()`).
        if (orderResult !== undefined) {
          return Promise.resolve(orderResult);
        }
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

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user } }),
    },
    from: jest.fn(() => baseBuilder()),
    rpc: jest.fn(),
  };
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

jest.mock("@/lib/services/studyPlanService", () => ({
  createPlanFromIntent: jest.fn().mockResolvedValue({
    plan: {
      id: "33333333-3333-4333-8333-333333333333",
      subject: "Matemática",
      topic: "Plano Cartesiano",
    },
    topics: [],
    error: null,
  }),
  parseStudentIntent: jest.fn().mockResolvedValue({
    subject: "Matemática",
    topic: "Plano Cartesiano e Simetrias",
    exam_date: "2026-04-23",
    exam_format: "discursive",
    subtopics: [
      { title: "Coordenadas", estimated_minutes: 25 },
      { title: "Simetrias", estimated_minutes: 30 },
    ],
  }),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";

const CHILD_UUID = "550e8400-e29b-41d4-a716-446655440000";

function req(url: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// /api/children/primary
// ---------------------------------------------------------------------------

describe("GET /api/children/primary", () => {
  it("returns 401 when not authenticated", async () => {
    const { GET } = await import("../children/primary/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await GET(req("/api/children/primary"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with existing child when one exists", async () => {
    const { GET } = await import("../children/primary/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        orderResult: {
          data: [{ id: CHILD_UUID, name: "Henrique" }],
          error: null,
        },
      })
    );
    const res = await GET(req("/api/children/primary"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(CHILD_UUID);
  });

  it("returns 201 lazily creating a child when none exists", async () => {
    const { GET } = await import("../children/primary/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        orderResult: { data: [], error: null },
        insertResult: {
          data: { id: CHILD_UUID, name: "Henrique" },
          error: null,
        },
      })
    );
    const res = await GET(req("/api/children/primary?name=Henrique"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("Henrique");
  });

  it("returns 500 when insert fails", async () => {
    const { GET } = await import("../children/primary/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        orderResult: { data: [], error: null },
        insertResult: { data: null, error: { message: "dup" } },
      })
    );
    const res = await GET(req("/api/children/primary"));
    expect(res.status).toBe(500);
  });

  it("returns 500 when the select errors out", async () => {
    const { GET } = await import("../children/primary/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        orderResult: { data: null, error: { message: "boom" } },
      })
    );
    const res = await GET(req("/api/children/primary"));
    expect(res.status).toBe(500);
  });

  it("returns 400 when name param is invalid (empty after trim)", async () => {
    const { GET } = await import("../children/primary/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await GET(req("/api/children/primary?name=%20%20%20"));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// /api/study/plans/from-utterance
// ---------------------------------------------------------------------------

describe("POST /api/study/plans/from-utterance", () => {
  it("returns 401 when not authenticated", async () => {
    const { POST } = await import("../study/plans/from-utterance/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await POST(
      req("/api/study/plans/from-utterance", "POST", {
        child_id: CHILD_UUID,
        utterance: "Matemática quinta 23/04 plano cartesiano",
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed body", async () => {
    const { POST } = await import("../study/plans/from-utterance/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await POST(
      req("/api/study/plans/from-utterance", "POST", { child_id: "not-a-uuid" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when child does not belong to user", async () => {
    const { POST } = await import("../study/plans/from-utterance/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: null, error: null },
      })
    );
    const res = await POST(
      req("/api/study/plans/from-utterance", "POST", {
        child_id: CHILD_UUID,
        utterance: "Matemática quinta 23/04 plano cartesiano",
      })
    );
    expect(res.status).toBe(404);
  });

  it("returns 201 when plan is created from utterance", async () => {
    const { POST } = await import("../study/plans/from-utterance/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: { id: CHILD_UUID, name: "Henrique" }, error: null },
      })
    );
    const res = await POST(
      req("/api/study/plans/from-utterance", "POST", {
        child_id: CHILD_UUID,
        utterance: "Matemática quinta 23/04 plano cartesiano AV2 discursivo",
        student_name: "Henrique",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.plan.id).toBeTruthy();
    expect(body.data.intent.exam_format).toBe("discursive");
  });
});

// ---------------------------------------------------------------------------
// /api/gamification/topics
// ---------------------------------------------------------------------------

describe("GET /api/gamification/topics", () => {
  it("returns 401 when not authenticated", async () => {
    const { GET } = await import("../gamification/topics/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: null })
    );
    const res = await GET(
      req(`/api/gamification/topics?child_id=${CHILD_UUID}`)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when child_id missing", async () => {
    const { GET } = await import("../gamification/topics/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await GET(req("/api/gamification/topics"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when child not owned", async () => {
    const { GET } = await import("../gamification/topics/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: null, error: null },
      })
    );
    const res = await GET(
      req(`/api/gamification/topics?child_id=${CHILD_UUID}`)
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with an empty list when the child has no topics", async () => {
    const { GET } = await import("../gamification/topics/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        // Ownership lookup goes through `.single()` so it uses queryResult.
        queryResult: { data: { id: CHILD_UUID }, error: null },
        // The subsequent `.order(...).limit(50)` chain resolves through `.limit`
        // — return an empty topic array so the mapper doesn't choke.
        orderResult: { data: [], error: null },
      })
    );
    const res = await GET(
      req(`/api/gamification/topics?child_id=${CHILD_UUID}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("returns 200 and maps rows with embedded study_plans.subject", async () => {
    const { GET } = await import("../gamification/topics/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: { id: CHILD_UUID }, error: null },
        orderResult: {
          data: [
            {
              title: "Coordenadas",
              mastery_score: 0.9,
              last_reviewed_at: "2026-04-19T10:00:00Z",
              study_plans: { subject: "Matemática" },
            },
            {
              title: "Simetrias",
              mastery_score: 0.2,
              last_reviewed_at: null,
              study_plans: [{ subject: "UnknownSubject" }],
            },
          ],
          error: null,
        },
      })
    );
    const res = await GET(
      req(`/api/gamification/topics?child_id=${CHILD_UUID}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].subject).toBe("matematica");
    expect(body.data[0].mastery).toBe("mastered");
    expect(body.data[1].mastery).toBe("new"); // 0.2 < 0.25 threshold
    // Unknown subjects normalize to "matematica" as a safe default
    expect(body.data[1].subject).toBe("matematica");
  });

  it("returns 400 when child_id is not a valid UUID", async () => {
    const { GET } = await import("../gamification/topics/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({ user: { id: "u1" } })
    );
    const res = await GET(
      req("/api/gamification/topics?child_id=not-a-uuid")
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when the topics query errors", async () => {
    const { GET } = await import("../gamification/topics/route");
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      makeSupabaseMock({
        user: { id: "u1" },
        queryResult: { data: { id: CHILD_UUID }, error: null },
        orderResult: { data: null, error: { message: "db" } },
      })
    );
    const res = await GET(
      req(`/api/gamification/topics?child_id=${CHILD_UUID}`)
    );
    expect(res.status).toBe(500);
  });
});
