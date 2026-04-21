/**
 * @jest-environment node
 */
import {
  computeRankFromMmr,
  recalculateMmr,
  levelFromXp,
  classifyFlashcardXp,
  simuladoBonus,
  evaluateRule,
  generateDailyQuestDefinitions,
  dailyQuestSeed,
  rollPowerUpDrop,
  XP_TABLE,
  RANKS,
} from "../gamificationService";

describe("computeRankFromMmr", () => {
  it("maps 0 to Aprendiz III", () => {
    expect(computeRankFromMmr(0)).toEqual({ rank: "Aprendiz", division: "III" });
  });

  it("maps 400 to Aprendiz II", () => {
    expect(computeRankFromMmr(400)).toEqual({ rank: "Aprendiz", division: "II" });
  });

  it("maps 800 to Aprendiz I", () => {
    expect(computeRankFromMmr(800)).toEqual({ rank: "Aprendiz", division: "I" });
  });

  it("maps 1200 to Batedor III", () => {
    expect(computeRankFromMmr(1200)).toEqual({ rank: "Batedor", division: "III" });
  });

  it("saturates at Mestre for very high MMR", () => {
    expect(computeRankFromMmr(999999).rank).toBe("Mestre");
  });

  it("has 7 named ranks", () => {
    expect(RANKS).toHaveLength(7);
  });
});

describe("recalculateMmr", () => {
  it("returns 0 for zeros across the board", () => {
    expect(
      recalculateMmr({
        accuracyLast30: 0,
        socraticEngagement: 0,
        consistencyDays: 0,
        averageDifficulty: 0,
      })
    ).toBe(0);
  });

  it("returns 10000 when all inputs are 1", () => {
    expect(
      recalculateMmr({
        accuracyLast30: 1,
        socraticEngagement: 1,
        consistencyDays: 7,
        averageDifficulty: 1,
      })
    ).toBe(10000);
  });

  it("weights accuracy at 40%", () => {
    const score = recalculateMmr({
      accuracyLast30: 1,
      socraticEngagement: 0,
      consistencyDays: 0,
      averageDifficulty: 0,
    });
    expect(score).toBe(4000);
  });

  it("weights engagement at 25%", () => {
    const score = recalculateMmr({
      accuracyLast30: 0,
      socraticEngagement: 1,
      consistencyDays: 0,
      averageDifficulty: 0,
    });
    expect(score).toBe(2500);
  });

  it("weights consistency at 20% when all 7 days active", () => {
    const score = recalculateMmr({
      accuracyLast30: 0,
      socraticEngagement: 0,
      consistencyDays: 7,
      averageDifficulty: 0,
    });
    expect(score).toBe(2000);
  });

  it("weights difficulty at 15%", () => {
    const score = recalculateMmr({
      accuracyLast30: 0,
      socraticEngagement: 0,
      consistencyDays: 0,
      averageDifficulty: 1,
    });
    expect(score).toBe(1500);
  });

  it("clamps out-of-range inputs", () => {
    const score = recalculateMmr({
      accuracyLast30: 2,
      socraticEngagement: -1,
      consistencyDays: 99,
      averageDifficulty: 5,
    });
    // Clamps are: 1, 0, 1, 1 -> 4000 + 0 + 2000 + 1500
    expect(score).toBe(7500);
  });
});

describe("levelFromXp — monotonic, never decreasing", () => {
  it("returns 1 at 0 XP", () => {
    expect(levelFromXp(0)).toBe(1);
  });

  it("is strictly non-decreasing", () => {
    let prev = levelFromXp(0);
    for (let xp = 0; xp < 10000; xp += 37) {
      const l = levelFromXp(xp);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });

  it("reaches level 10 at some reasonable XP", () => {
    expect(levelFromXp(5500)).toBeGreaterThanOrEqual(10);
  });
});

describe("classifyFlashcardXp — Socratic-only rewards", () => {
  it("awards 15 XP for correct with no hints", () => {
    expect(classifyFlashcardXp(0, true, false)).toEqual({
      delta: XP_TABLE.flashcard_no_hint,
      reason: "flashcard_no_hint",
    });
  });

  it("awards 10 XP for correct with 1 hint", () => {
    expect(classifyFlashcardXp(1, true, false)).toEqual({
      delta: XP_TABLE.flashcard_1_hint,
      reason: "flashcard_1_hint",
    });
  });

  it("awards 6 XP for correct with 2+ hints", () => {
    expect(classifyFlashcardXp(2, true, false)).toEqual({
      delta: XP_TABLE.flashcard_2plus_hints,
      reason: "flashcard_2plus_hints",
    });
    expect(classifyFlashcardXp(5, true, false).reason).toBe("flashcard_2plus_hints");
  });

  it("awards 3 XP for wrong + debrief read (engagement floor)", () => {
    expect(classifyFlashcardXp(0, false, true)).toEqual({
      delta: XP_TABLE.error_read_debrief,
      reason: "error_read_debrief",
    });
  });

  it("awards 0 XP for wrong without debrief", () => {
    expect(classifyFlashcardXp(0, false, false).delta).toBe(0);
  });

  it("XP values are stable — 15 > 10 > 6 > 3", () => {
    expect(XP_TABLE.flashcard_no_hint).toBeGreaterThan(XP_TABLE.flashcard_1_hint);
    expect(XP_TABLE.flashcard_1_hint).toBeGreaterThan(XP_TABLE.flashcard_2plus_hints);
    expect(XP_TABLE.flashcard_2plus_hints).toBeGreaterThan(XP_TABLE.error_read_debrief);
  });
});

describe("simuladoBonus", () => {
  it("returns 50 base when accuracy is 0", () => {
    expect(simuladoBonus(0)).toBe(50);
  });

  it("returns 100 when accuracy is 1", () => {
    expect(simuladoBonus(1)).toBe(100);
  });

  it("clamps negative accuracy to 0", () => {
    expect(simuladoBonus(-0.5)).toBe(50);
  });
});

describe("evaluateRule", () => {
  const baseStats = {
    xpEventCounts: {},
    streakNoHint: 0,
    sessionDurationsMinutes: [],
    studyPlansCount: 0,
    distinctTopicsReviewed: 0,
    cardRetryMaxStreak: 0,
  };

  it("matches xp_event_count when total reaches target", () => {
    expect(
      evaluateRule(
        { type: "xp_event_count", reason_in: ["flashcard_no_hint"], count: 2 },
        { ...baseStats, xpEventCounts: { flashcard_no_hint: 3 } }
      )
    ).toBe(true);
  });

  it("does not match xp_event_count when short of target", () => {
    expect(
      evaluateRule(
        { type: "xp_event_count", reason_in: ["flashcard_no_hint"], count: 10 },
        { ...baseStats, xpEventCounts: { flashcard_no_hint: 3 } }
      )
    ).toBe(false);
  });

  it("matches flashcard_streak_no_hint", () => {
    expect(
      evaluateRule({ type: "flashcard_streak_no_hint", count: 20 }, { ...baseStats, streakNoHint: 25 })
    ).toBe(true);
  });

  it("matches session_duration_minutes when any session crosses the threshold", () => {
    expect(
      evaluateRule(
        { type: "session_duration_minutes", min: 30 },
        { ...baseStats, sessionDurationsMinutes: [10, 35, 5] }
      )
    ).toBe(true);
  });

  it("matches study_time_window for noturno (21h-23h)", () => {
    expect(
      evaluateRule({ type: "study_time_window", start_hour: 21, end_hour: 23 }, {
        ...baseStats,
        lastStudyHour: 22,
      })
    ).toBe(true);
  });

  it("rejects unknown rule types", () => {
    expect(evaluateRule({ type: "unknown_rule", count: 1 }, baseStats)).toBe(false);
    expect(evaluateRule(null, baseStats)).toBe(false);
  });

  it("matches simulado_comeback only after prior errors", () => {
    expect(
      evaluateRule(
        { type: "simulado_comeback", min_accuracy: 0.6 },
        { ...baseStats, hadPreviousErrors: true, latestSimuladoAccuracy: 0.7 }
      )
    ).toBe(true);
    expect(
      evaluateRule(
        { type: "simulado_comeback", min_accuracy: 0.6 },
        { ...baseStats, hadPreviousErrors: false, latestSimuladoAccuracy: 0.9 }
      )
    ).toBe(false);
  });
});

describe("dailyQuestSeed + generateDailyQuestDefinitions (deterministic)", () => {
  const CHILD = "1d4b0b20-0000-4000-8000-000000000001";
  const DAY = new Date("2026-04-20T00:00:00.000Z");

  it("dailyQuestSeed is deterministic for same child+day", () => {
    expect(dailyQuestSeed(CHILD, DAY)).toBe(dailyQuestSeed(CHILD, DAY));
  });

  it("produces a different seed for a different day", () => {
    const otherDay = new Date("2026-04-21T00:00:00.000Z");
    expect(dailyQuestSeed(CHILD, DAY)).not.toBe(dailyQuestSeed(CHILD, otherDay));
  });

  it("returns exactly 3 quests", () => {
    const quests = generateDailyQuestDefinitions(CHILD, DAY);
    expect(quests).toHaveLength(3);
  });

  it("each quest has a non-empty title, description and xp_reward > 0", () => {
    const quests = generateDailyQuestDefinitions(CHILD, DAY);
    for (const q of quests) {
      expect(q.title.length).toBeGreaterThan(0);
      expect(q.description.length).toBeGreaterThan(0);
      expect(q.xp_reward).toBeGreaterThan(0);
      expect(q.objectives[0].progress).toBe(0);
    }
  });

  it("is stable between calls on the same (child, day)", () => {
    const a = generateDailyQuestDefinitions(CHILD, DAY);
    const b = generateDailyQuestDefinitions(CHILD, DAY);
    expect(a).toEqual(b);
  });
});

describe("rollPowerUpDrop", () => {
  const candidates = [
    { code: "dica_extra", rarity: "common" },
    { code: "insight", rarity: "uncommon" },
    { code: "segunda_chance", rarity: "rare" },
  ];

  it("returns null when the no-drop threshold wins", () => {
    // rng > 0.4 means no drop.
    expect(rollPowerUpDrop(candidates, () => 0.9)).toBeNull();
  });

  it("returns a candidate when the drop roll succeeds", () => {
    // rng <= 0.4 means a drop; rest of the deck walks deterministically.
    const out = rollPowerUpDrop(candidates, () => 0.1);
    expect(out).not.toBeNull();
    expect(candidates.map((c) => c.code)).toContain(out!.code);
  });

  it("returns null on empty candidates", () => {
    expect(rollPowerUpDrop([], () => 0.1)).toBeNull();
  });
});

// Regression: no symbol, constant or helper in this module should reward speed.
describe("Socratic invariant — no speed/time rewards", () => {
  it("has no property with 'speed' or 'time_bonus' substring", async () => {
    const mod = await import("../gamificationService");
    const keys = Object.keys(mod).join("|").toLowerCase();
    expect(keys).not.toMatch(/speed|time_?bonus/);
  });
});
