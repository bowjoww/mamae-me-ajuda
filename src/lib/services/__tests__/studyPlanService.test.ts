/**
 * @jest-environment node
 */
const mockAskStructured = jest.fn();

jest.mock("../aiTutor", () => ({
  askStructured: (...args: unknown[]) => mockAskStructured(...args),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const svc = require("../studyPlanService") as typeof import("../studyPlanService");
/* eslint-enable @typescript-eslint/no-require-imports */

describe("parseStudentIntent", () => {
  it("returns the AI-supplied intent fields, carrying forward the photo ref", async () => {
    mockAskStructured.mockResolvedValueOnce({
      data: {
        subject: "Matemática",
        topic: "Funções de 1º grau",
        exam_date: "2026-05-10",
        subtopics: [
          { title: "Equações lineares", estimated_minutes: 30 },
          { title: "Gráficos", estimated_minutes: 45 },
        ],
      },
      modelUsed: "gpt-5.1",
      tokens: { input: 10, output: 20, total: 30 },
    });

    const result = await svc.parseStudentIntent({
      studentName: "Henrique",
      studentUtterance: "Preciso estudar para a prova de mat",
      examSamplePhotoUrl: "https://example.com/prova.jpg",
    });

    expect(result.subject).toBe("Matemática");
    expect(result.topic).toBe("Funções de 1º grau");
    expect(result.exam_date).toBe("2026-05-10");
    expect(result.subtopics).toHaveLength(2);
    expect(result.exam_sample_photo_url).toBe("https://example.com/prova.jpg");
  });

  it("passes mode=prova to the AI call", async () => {
    mockAskStructured.mockResolvedValueOnce({
      data: { subject: "x", topic: "y", exam_date: null, subtopics: [] },
      modelUsed: "gpt-5.1",
      tokens: { input: 0, output: 0, total: 0 },
    });
    await svc.parseStudentIntent({ studentName: "A", studentUtterance: "..." });
    const callArg = mockAskStructured.mock.calls[mockAskStructured.mock.calls.length - 1][0];
    expect(callArg.mode).toBe("prova");
  });
});

describe("createPlanFromIntent", () => {
  type Supa = Parameters<typeof svc.createPlanFromIntent>[0];

  function makeSupabase({
    planResult,
    topicsResult,
  }: {
    planResult: { data: unknown; error: unknown };
    topicsResult: { data: unknown; error: unknown };
  }) {
    const planSingle = jest.fn().mockResolvedValue(planResult);
    const topicsSelect = jest.fn().mockResolvedValue(topicsResult);

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === "study_plans") {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: planSingle,
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        if (table === "study_topics") {
          return {
            insert: jest.fn().mockReturnThis(),
            select: topicsSelect,
          };
        }
        return {};
      }),
    } as unknown as Supa;

    return supabase;
  }

  const intentBase = {
    subject: "Mat",
    topic: "Algebra",
    subtopics: [
      { title: "Eq", estimated_minutes: 10 },
      { title: "Fn", estimated_minutes: 20 },
    ],
  };

  it("creates a plan + topics on the happy path", async () => {
    const supabase = makeSupabase({
      planResult: { data: { id: "plan-1", subject: "Mat", topic: "Algebra" }, error: null },
      topicsResult: { data: [{ id: "t1" }, { id: "t2" }], error: null },
    });

    const out = await svc.createPlanFromIntent(supabase, {
      parentId: "parent-1",
      childId: "child-1",
      intent: intentBase,
    });

    expect(out.error).toBeNull();
    expect(out.plan?.id).toBe("plan-1");
    expect(out.topics).toHaveLength(2);
  });

  it("returns plan with empty topics when intent has no subtopics", async () => {
    const supabase = makeSupabase({
      planResult: { data: { id: "plan-2" }, error: null },
      topicsResult: { data: [], error: null },
    });
    const out = await svc.createPlanFromIntent(supabase, {
      parentId: "parent-1",
      childId: "child-1",
      intent: { subject: "Mat", topic: "Algebra", subtopics: [] },
    });
    expect(out.error).toBeNull();
    expect(out.plan?.id).toBe("plan-2");
    expect(out.topics).toHaveLength(0);
  });

  it("surfaces a plan-insert failure", async () => {
    const supabase = makeSupabase({
      planResult: { data: null, error: { message: "unique violation" } },
      topicsResult: { data: null, error: null },
    });
    const out = await svc.createPlanFromIntent(supabase, {
      parentId: "parent-1",
      childId: "child-1",
      intent: intentBase,
    });
    expect(out.plan).toBeNull();
    expect(out.error).toBe("unique violation");
  });

  it("rolls back the plan when topic insert fails", async () => {
    const supabase = makeSupabase({
      planResult: { data: { id: "plan-3" }, error: null },
      topicsResult: { data: null, error: { message: "fk violation" } },
    });
    const out = await svc.createPlanFromIntent(supabase, {
      parentId: "parent-1",
      childId: "child-1",
      intent: intentBase,
    });
    expect(out.plan).toBeNull();
    expect(out.error).toBe("fk violation");
  });
});
