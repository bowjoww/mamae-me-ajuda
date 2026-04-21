/**
 * @jest-environment node
 */
import {
  computeEngagementScore,
  isFocusSession,
  FOCUS_SESSION_MIN_MINUTES,
} from "../studySessionService";

describe("computeEngagementScore", () => {
  it("returns 1 when no hints are used", () => {
    expect(computeEngagementScore(0, 5)).toBe(1);
  });

  it("returns 0 when all hints are used", () => {
    expect(computeEngagementScore(5, 5)).toBe(0);
  });

  it("returns a fractional score in between", () => {
    expect(computeEngagementScore(2, 4)).toBeCloseTo(0.5);
  });

  it("clamps negative results to 0 when hintsUsed > hintsAvailable", () => {
    expect(computeEngagementScore(10, 2)).toBe(0);
  });

  it("treats zero availability defensively (uses 1)", () => {
    expect(computeEngagementScore(0, 0)).toBe(1);
    expect(computeEngagementScore(1, 0)).toBe(0);
  });
});

describe("isFocusSession", () => {
  it(`is true when session is ${FOCUS_SESSION_MIN_MINUTES}+ minutes`, () => {
    const start = new Date("2026-04-20T00:00:00Z");
    const end = new Date(start.getTime() + (FOCUS_SESSION_MIN_MINUTES + 1) * 60000);
    expect(isFocusSession(start, end)).toBe(true);
  });

  it("is false for short sessions", () => {
    const start = new Date("2026-04-20T00:00:00Z");
    const end = new Date(start.getTime() + 5 * 60000);
    expect(isFocusSession(start, end)).toBe(false);
  });
});
