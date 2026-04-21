import {
  RANKS,
  SUBJECTS,
  RANK_LABEL,
  SUBJECT_LABEL,
  RANK_META,
  getRankMeta,
  type Rank,
  type Subject,
} from "../types";

describe("gamification types", () => {
  it("exposes all 7 ranks in order", () => {
    expect(RANKS).toHaveLength(7);
    expect(RANKS[0]).toBe("aprendiz");
    expect(RANKS[RANKS.length - 1]).toBe("mestre");
  });

  it("covers all 6 subjects", () => {
    expect(SUBJECTS).toHaveLength(6);
    expect(SUBJECTS).toContain("matematica");
    expect(SUBJECTS).toContain("portugues");
  });

  it("provides a label for every rank", () => {
    RANKS.forEach((rank: Rank) => {
      expect(RANK_LABEL[rank]).toBeTruthy();
    });
  });

  it("provides a label for every subject", () => {
    SUBJECTS.forEach((subject: Subject) => {
      expect(SUBJECT_LABEL[subject]).toBeTruthy();
    });
  });

  it("provides meta (label, color, lore) for every rank", () => {
    RANKS.forEach((rank: Rank) => {
      const meta = RANK_META[rank];
      expect(meta.label).toBeTruthy();
      expect(meta.color).toContain("var(--rank-");
      expect(meta.lore.length).toBeGreaterThan(10);
    });
  });

  it("getRankMeta accepts canonical lowercase slug", () => {
    expect(getRankMeta("batedor").label).toBe("Batedor");
  });

  it("getRankMeta accepts legacy PT display label with accents", () => {
    // Server may send display labels like "Artesão" or "Cartógrafo".
    expect(getRankMeta("Artesão").label).toBe("Artesão");
    expect(getRankMeta("Cartógrafo").label).toBe("Cartógrafo");
  });

  it("getRankMeta falls back to aprendiz for unknown input", () => {
    expect(getRankMeta("unknown-thing").label).toBe("Aprendiz");
  });
});
