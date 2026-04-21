/**
 * @jest-environment node
 *
 * IO-side tests for gamificationService — covers awardXp, catalog/quest
 * fetchers, and the branches of evaluateRule / rollPowerUpDrop not covered
 * elsewhere.
 */
import {
  awardXp,
  fetchAchievementsCatalog,
  fetchActiveQuests,
  evaluateRule,
  rollPowerUpDrop,
  recalculateMmr,
  levelFromXp,
} from "../gamificationService";

type Supa = Parameters<typeof awardXp>[0];

describe("awardXp", () => {
  it("short-circuits when delta is 0", async () => {
    const rpc = jest.fn();
    const supabase = { rpc } as unknown as Supa;
    const out = await awardXp(supabase, {
      childId: "c",
      delta: 0,
      reason: "flashcard_no_hint",
    });
    expect(out.newTotal).toBeNull();
    expect(out.error).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the db error when RPC fails", async () => {
    const supabase = {
      rpc: jest
        .fn()
        .mockResolvedValue({ data: null, error: { message: "forbidden" } }),
    } as unknown as Supa;
    const out = await awardXp(supabase, {
      childId: "c",
      delta: 10,
      reason: "flashcard_no_hint",
    });
    expect(out.error).toBe("forbidden");
  });

  it("returns new total on success", async () => {
    const supabase = {
      rpc: jest.fn().mockResolvedValue({ data: 42, error: null }),
    } as unknown as Supa;
    const out = await awardXp(supabase, {
      childId: "c",
      delta: 15,
      reason: "flashcard_no_hint",
    });
    expect(out.newTotal).toBe(42);
    expect(out.error).toBeNull();
  });
});

describe("fetchAchievementsCatalog", () => {
  it("returns [] on error", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          limit: () =>
            Promise.resolve({ data: null, error: { message: "x" } }),
        }),
      }),
    } as unknown as Supa;
    const out = await fetchAchievementsCatalog(supabase);
    expect(out).toEqual([]);
  });

  it("returns the data list on success", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          limit: () =>
            Promise.resolve({
              data: [{ code: "primeiro_sangue" }],
              error: null,
            }),
        }),
      }),
    } as unknown as Supa;
    const out = await fetchAchievementsCatalog(supabase);
    expect(out).toHaveLength(1);
  });
});

describe("fetchActiveQuests", () => {
  it("returns [] on error", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: () =>
                Promise.resolve({ data: null, error: { message: "fail" } }),
            }),
          }),
        }),
      }),
    } as unknown as Supa;
    const out = await fetchActiveQuests(supabase, "child-1");
    expect(out).toEqual([]);
  });
});

describe("evaluateRule — additional branches", () => {
  const base = {
    xpEventCounts: {},
    streakNoHint: 0,
    sessionDurationsMinutes: [],
    studyPlansCount: 0,
    distinctTopicsReviewed: 0,
    cardRetryMaxStreak: 0,
  };

  it("matches study_plans_count", () => {
    expect(evaluateRule({ type: "study_plans_count", count: 3 }, { ...base, studyPlansCount: 5 })).toBe(
      true
    );
  });

  it("matches distinct_topics_reviewed", () => {
    expect(
      evaluateRule({ type: "distinct_topics_reviewed", count: 10 }, { ...base, distinctTopicsReviewed: 15 })
    ).toBe(true);
  });

  it("matches card_retry_streak", () => {
    expect(
      evaluateRule({ type: "card_retry_streak", min_retries: 3 }, { ...base, cardRetryMaxStreak: 4 })
    ).toBe(true);
  });

  it("matches streak_returned when the return delay meets threshold", () => {
    expect(
      evaluateRule({ type: "streak_returned", after_days: 3 }, { ...base, returnedAfterDays: 4 })
    ).toBe(true);
  });

  it("rejects rule that isn't an object", () => {
    expect(evaluateRule(42, base)).toBe(false);
    expect(evaluateRule("foo", base)).toBe(false);
  });

  it("rejects study_time_window when no lastStudyHour", () => {
    expect(
      evaluateRule({ type: "study_time_window", start_hour: 21, end_hour: 23 }, base)
    ).toBe(false);
  });

  it("rejects streak_returned when no returnedAfterDays", () => {
    expect(evaluateRule({ type: "streak_returned", after_days: 3 }, base)).toBe(false);
  });
});

describe("rollPowerUpDrop — fallback branch", () => {
  it("falls back to last item when weights are exhausted in picker", () => {
    const candidates = [
      { code: "a", rarity: "common" },
      { code: "b", rarity: "common" },
    ];
    // rng = 0.39 triggers drop; pick runs through both weights.
    const out = rollPowerUpDrop(candidates, () => 0.39);
    expect(out).not.toBeNull();
  });
});

describe("MMR / level edge cases", () => {
  it("rounds MMR back to 0 when all signals are zero", () => {
    expect(
      recalculateMmr({
        accuracyLast30: 0,
        socraticEngagement: 0,
        consistencyDays: 0,
        averageDifficulty: 0,
      })
    ).toBe(0);
  });

  it("levelFromXp is non-decreasing across a broad sweep", () => {
    let prev = levelFromXp(0);
    for (let i = 1; i < 20000; i += 123) {
      const l = levelFromXp(i);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });
});
