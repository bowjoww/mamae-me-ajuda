import {
  GamificationError,
  clearCachedChildId,
  createStudyPlanFromUtterance,
  fetchProfile,
  fetchQuests,
  fetchStudyPlan,
  fetchNextFlashcards,
  fetchTopics,
  getOrCreateChildId,
  submitFlashcardReview,
} from "../gamificationClient";

function okJsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  } as unknown as Response;
}

// Seed a cached child_id in localStorage so the helpers don't try to hit
// /api/children/primary first. Tests stub `fetch` once per case without
// per-URL granularity; without this seed the first fetch would be consumed
// by the child resolution call and skew every assertion.
function seedChildId(id = "00000000-0000-4000-8000-000000000000") {
  try {
    window.localStorage.setItem("mma.primaryChildId", id);
  } catch {
    // noop — jsdom always supports localStorage in our test env.
  }
}

describe("gamificationClient", () => {
  beforeEach(() => {
    clearCachedChildId();
    seedChildId();
  });
  afterEach(() => jest.resetAllMocks());

  it("fetchProfile returns the mock fallback when fetch fails", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("network"));
    const p = await fetchProfile();
    expect(p.studentName).toBe("Henrique");
    expect(p.subjects.length).toBeGreaterThan(0);
  });

  it("fetchProfile unwraps a { data } envelope when backend returns that shape", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockResolvedValue(
      okJsonResponse({
        data: {
          studentName: "Ana",
          title: "Batedor",
          totalXp: 0,
          tier: { rank: "batedor", division: "II" },
          currentXp: 0,
          xpForNext: 0,
          streak: { days: 0, lastActiveIso: "" },
          subjects: [],
          activity7d: [0, 0, 0, 0, 0, 0, 0],
          achievements: [],
          inventory: [],
        },
      })
    );
    const p = await fetchProfile();
    expect(p.studentName).toBe("Ana");
  });

  it("fetchQuests returns a non-empty list from the mock", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const q = await fetchQuests();
    expect(q.length).toBeGreaterThan(0);
  });

  it("fetchTopics returns a non-empty list from the mock", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const t = await fetchTopics();
    expect(t.length).toBeGreaterThan(0);
  });

  it("fetchStudyPlan returns null when id is null", async () => {
    const plan = await fetchStudyPlan(null);
    expect(plan).toBeNull();
  });

  it("fetchStudyPlan returns a plan when id is provided", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const plan = await fetchStudyPlan("plan-1");
    expect(plan?.missions.length).toBeGreaterThan(0);
  });

  it("fetchNextFlashcards respects limit", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const cards = await fetchNextFlashcards(2);
    expect(cards.length).toBeLessThanOrEqual(2);
  });

  it("submitFlashcardReview returns outcome with XP", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const outcome = await submitFlashcardReview("fc-1", "acertei");
    expect(outcome.xpAwarded).toBeGreaterThan(0);
    expect(outcome.nextReviewIso).toBeTruthy();
  });

  it("submitFlashcardReview returns smaller XP on wrong answers", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const wrong = await submitFlashcardReview("fc-1", "errei");
    const right = await submitFlashcardReview("fc-1", "acertei");
    expect(wrong.xpAwarded).toBeLessThan(right.xpAwarded);
  });

  it("submitFlashcardReview scales XP by grade (quase is in between)", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const quase = await submitFlashcardReview("fc-1", "quase");
    expect(quase.xpAwarded).toBeGreaterThan(0);
    expect(quase.xpAwarded).toBeLessThan(18);
  });

  it("getOrCreateChildId returns the cached id without fetching", async () => {
    // With the seeded cache, there should be zero network activity.
    const spy = jest.fn().mockRejectedValue(new Error("should-not-be-called"));
    (global as unknown as { fetch: jest.Mock }).fetch = spy;
    const id = await getOrCreateChildId();
    expect(id).toBe("00000000-0000-4000-8000-000000000000");
    expect(spy).not.toHaveBeenCalled();
  });

  it("getOrCreateChildId hits the API when cache is empty and returns the id", async () => {
    clearCachedChildId();
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockResolvedValue(
      okJsonResponse({ data: { id: "11111111-1111-4111-8111-111111111111" } })
    );
    const id = await getOrCreateChildId({ preferredName: "Henrique" });
    expect(id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("getOrCreateChildId throws GamificationError when the endpoint errors", async () => {
    clearCachedChildId();
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    } as unknown as Response);
    await expect(getOrCreateChildId()).rejects.toBeInstanceOf(
      GamificationError
    );
  });

  it("getOrCreateChildId throws when the response has no id", async () => {
    clearCachedChildId();
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockResolvedValue(okJsonResponse({ data: {} }));
    await expect(getOrCreateChildId()).rejects.toBeInstanceOf(
      GamificationError
    );
  });

  it("createStudyPlanFromUtterance surfaces backend errors", async () => {
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "db down" }),
    } as unknown as Response);
    await expect(
      createStudyPlanFromUtterance({ utterance: "teste" })
    ).rejects.toBeInstanceOf(GamificationError);
  });

  it("fetchProfile with resolved child_id hits the real endpoint and maps the envelope", async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      .mockResolvedValueOnce(
        okJsonResponse({
          data: {
            profile: {
              total_xp: 500,
              current_rank: "Batedor",
              rank_division: "II",
              streak_days: 3,
            },
            achievements: [],
            inventory: [],
            child_name: "Henrique",
          },
        })
      );
    const p = await fetchProfile();
    expect(p.totalXp).toBe(500);
    expect(p.tier.rank).toBe("batedor");
    expect(p.studentName).toBe("Henrique");
  });

  it("fetchStudyPlan maps the server envelope to a client StudyPlan", async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      .mockResolvedValueOnce(
        okJsonResponse({
          data: {
            plan: {
              id: "plan-42",
              subject: "Matemática",
              topic: "Plano Cartesiano",
              exam_date: "2026-04-23",
              created_at: "2026-04-15T00:00:00Z",
              metadata: { exam_format: "discursive" },
            },
            topics: [],
          },
        })
      );
    const plan = await fetchStudyPlan("plan-42");
    expect(plan?.id).toBe("plan-42");
    expect(plan?.subject).toBe("matematica");
  });

  it("fetchTopics returns the server-provided list when the endpoint is live", async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      .mockResolvedValueOnce(
        okJsonResponse({
          data: [
            {
              topic: "Simetria axial",
              subject: "matematica",
              mastery: "progress",
              lastStudiedIso: "2026-04-19T10:00:00Z",
            },
          ],
        })
      );
    const t = await fetchTopics();
    expect(t).toHaveLength(1);
    expect(t[0].topic).toBe("Simetria axial");
  });

  it("fetchQuests returns the server-provided list when the endpoint is live", async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      .mockResolvedValueOnce(okJsonResponse({ data: [] }));
    const q = await fetchQuests();
    expect(q).toEqual([]);
  });

  it("clearCachedChildId tolerates localStorage failure", () => {
    // Patch the prototype so the `throw` is wired through the real chain.
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = () => {
      throw new Error("quota");
    };
    try {
      expect(() => clearCachedChildId()).not.toThrow();
    } finally {
      Storage.prototype.removeItem = originalRemove;
    }
  });

  it("getOrCreateChildId tolerates a localStorage write failure", async () => {
    clearCachedChildId();
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
    try {
      (
        global as unknown as { fetch: jest.Mock }
      ).fetch = jest.fn().mockResolvedValue(
        okJsonResponse({
          data: { id: "22222222-2222-4222-8222-222222222222" },
        })
      );
      const id = await getOrCreateChildId();
      expect(id).toBe("22222222-2222-4222-8222-222222222222");
    } finally {
      Storage.prototype.setItem = originalSet;
    }
  });

  it("fetchProfile surfaces an empty data envelope as the fallback", async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      .mockResolvedValueOnce(okJsonResponse({ data: null }));
    const p = await fetchProfile();
    // When data is null, fetchJson returns mockFallback.
    expect(p.studentName).toBe("Henrique");
  });

  it("fetchProfile tolerates backend HTTP errors and returns the fallback in test env", async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "db" }),
    } as unknown as Response);
    const p = await fetchProfile();
    expect(p.studentName).toBe("Henrique");
  });

  it("fetchNextFlashcards falls back to the mock when child resolution fails", async () => {
    clearCachedChildId();
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const cards = await fetchNextFlashcards(2);
    expect(cards.length).toBeLessThanOrEqual(2);
  });

  it("fetchQuests falls back to the mock when child resolution fails", async () => {
    clearCachedChildId();
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const q = await fetchQuests();
    expect(q.length).toBeGreaterThan(0);
  });

  it("fetchTopics falls back to the mock when child resolution fails", async () => {
    clearCachedChildId();
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const t = await fetchTopics();
    expect(t.length).toBeGreaterThan(0);
  });

  it("fetchProfile falls back to the mock when child resolution fails", async () => {
    clearCachedChildId();
    (
      global as unknown as { fetch: jest.Mock }
    ).fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const p = await fetchProfile();
    expect(p.studentName).toBe("Henrique");
  });

  it("createStudyPlanFromUtterance handles non-JSON error bodies", async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not-json");
      },
    } as unknown as Response);
    await expect(
      createStudyPlanFromUtterance({ utterance: "teste" })
    ).rejects.toBeInstanceOf(GamificationError);
  });

  it("createStudyPlanFromUtterance returns plan + studyPlan on success", async () => {
    const planPayload = {
      data: {
        plan: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          subject: "Matemática",
          topic: "Plano Cartesiano",
          exam_date: "2026-04-23",
          created_at: "2026-04-20T10:00:00Z",
          metadata: { exam_format: "discursive" },
        },
        topics: [],
      },
    };
    (global as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      // 1st call: POST /api/study/plans/from-utterance
      .mockResolvedValueOnce(
        okJsonResponse({
          data: { plan: { id: planPayload.data.plan.id }, topics: [] },
        })
      )
      // 2nd call: GET /api/study/plans/:id (fetchStudyPlan) — returns envelope
      .mockResolvedValueOnce(okJsonResponse(planPayload));

    const result = await createStudyPlanFromUtterance({
      utterance: "Matemática quinta 23/04 plano cartesiano",
      studentName: "Henrique",
    });
    expect(result.planId).toBe(planPayload.data.plan.id);
    expect(result.studyPlan.subject).toBe("matematica");
    expect(result.studyPlan.id).toBe(planPayload.data.plan.id);
  });
});
