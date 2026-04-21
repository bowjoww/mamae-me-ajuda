import {
  mapServerProfile,
  mapServerStudyPlan,
} from "../gamificationMappers";
import {
  mockProfile,
  mockStudyPlan,
} from "../__mocks__/gamificationFixtures";

describe("mapServerProfile", () => {
  it("returns the payload as-is when it already matches the client Profile shape", () => {
    const out = mapServerProfile(mockProfile, mockProfile);
    expect(out).toBe(mockProfile);
  });

  it("falls back to the provided Profile when input is nonsense", () => {
    const out = mapServerProfile("definitely not a profile", mockProfile);
    expect(out).toBe(mockProfile);
  });

  it("maps a server envelope into the client Profile, preserving child_name", () => {
    const out = mapServerProfile(
      {
        profile: {
          total_xp: 123,
          current_rank: "Explorador",
          rank_division: "II",
          display_title: "  Cartógrafo  ",
          streak_days: 4,
          last_active_at: "2026-04-19T10:00:00Z",
        },
        achievements: [
          { achievement_code: "first-strike", unlocked_at: "2026-04-10" },
        ],
        inventory: [{ power_up_code: "bussola", qty: 3 }],
        child_name: "Henrique",
      },
      mockProfile
    );
    expect(out.studentName).toBe("Henrique");
    expect(out.totalXp).toBe(123);
    expect(out.tier.rank).toBe("explorador");
    expect(out.tier.division).toBe("II");
    expect(out.title).toBe("Cartógrafo");
    expect(out.streak.days).toBe(4);
    expect(out.achievements[0].id).toBe("first-strike");
    expect(out.inventory[0].id).toBe("bussola");
    expect(out.inventory[0].charges).toBe(3);
  });

  it("normalizes unknown rank strings to 'aprendiz'", () => {
    const out = mapServerProfile(
      {
        profile: {
          total_xp: 0,
          current_rank: "Ultra-Mestre-do-Pixel",
          rank_division: "III",
          streak_days: 0,
        },
        achievements: [],
        inventory: [],
        child_name: "Henrique",
      },
      mockProfile
    );
    expect(out.tier.rank).toBe("aprendiz");
  });

  it("falls back to mock subjects/activity when the server omits them", () => {
    const out = mapServerProfile(
      {
        profile: null,
        achievements: [],
        inventory: [],
        child_name: null,
      },
      mockProfile
    );
    // Falls back to the mock student name when child_name is null
    expect(out.studentName).toBe(mockProfile.studentName);
    expect(out.subjects).toBe(mockProfile.subjects);
    expect(out.activity7d).toBe(mockProfile.activity7d);
  });
});

describe("mapServerStudyPlan", () => {
  it("returns the payload as-is when it already matches the client StudyPlan shape", () => {
    const out = mapServerStudyPlan(mockStudyPlan, mockStudyPlan);
    expect(out).toBe(mockStudyPlan);
  });

  it("falls back to the provided plan when input is not an envelope", () => {
    const out = mapServerStudyPlan(42, mockStudyPlan);
    expect(out).toBe(mockStudyPlan);
  });

  it("maps a server envelope into the client StudyPlan with topics as missions", () => {
    const out = mapServerStudyPlan(
      {
        plan: {
          id: "plan-42",
          subject: "Matemática",
          topic: "Plano Cartesiano",
          exam_date: "2026-04-23",
          created_at: "2026-04-15T00:00:00Z",
          metadata: { exam_format: "discursive" },
        },
        topics: [
          {
            id: "t1",
            title: "Coordenadas",
            order: 0,
            mastery_score: 0.9,
            last_reviewed_at: "2026-04-19T00:00:00Z",
          },
          {
            id: "t2",
            title: "Simetrias",
            order: 1,
            mastery_score: 0.15,
            last_reviewed_at: null,
          },
          {
            id: "t3",
            title: "Aplicações",
            order: 2,
            mastery_score: 0,
            last_reviewed_at: null,
          },
        ],
      },
      mockStudyPlan
    );
    expect(out.id).toBe("plan-42");
    expect(out.subject).toBe("matematica");
    expect(out.title).toBe("Plano Cartesiano");
    // Mission 0 — mastered because mastery_score >= 0.75
    expect(out.missions[0].status).toBe("completed");
    // Mission 1 — active because 0.1 <= mastery_score < 0.75
    expect(out.missions[1].status).toBe("active");
    // Mission 2 — idle because mastery_score < 0.1
    expect(out.missions[2].status).toBe("idle");
  });

  it("defaults subject to 'matematica' when the server ships an unknown value", () => {
    const out = mapServerStudyPlan(
      {
        plan: {
          id: "plan-x",
          subject: "Astronomia",
          topic: "Órbitas",
          exam_date: "2026-05-01",
          created_at: "2026-04-15T00:00:00Z",
          metadata: null,
        },
        topics: [],
      },
      mockStudyPlan
    );
    expect(out.subject).toBe("matematica");
  });

  it("falls back when the envelope has no plan.id", () => {
    const out = mapServerStudyPlan(
      { plan: null, topics: [] },
      mockStudyPlan
    );
    expect(out).toBe(mockStudyPlan);
  });
});
