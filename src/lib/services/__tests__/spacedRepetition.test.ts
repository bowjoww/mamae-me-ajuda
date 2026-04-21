/**
 * @jest-environment node
 */
import {
  schedule,
  readSm2State,
  SM2_INITIAL_EF,
  SM2_MIN_EF,
  type Sm2StateInput,
} from "../spacedRepetition";

const FIXED_NOW = new Date("2026-04-20T12:00:00.000Z");

function initial(): Sm2StateInput {
  return { ef: SM2_INITIAL_EF, interval: 0, repetitions: 0 };
}

describe("schedule (SM-2)", () => {
  it("sets interval to 1 day on first successful (q=5) review", () => {
    const next = schedule(initial(), 5, FIXED_NOW);
    expect(next.repetitions).toBe(1);
    expect(next.interval).toBe(1);
    expect(next.quality).toBe(5);
  });

  it("sets interval to 6 days on second successful (q=5) review", () => {
    const first = schedule(initial(), 5, FIXED_NOW);
    const second = schedule(first, 5, FIXED_NOW);
    expect(second.repetitions).toBe(2);
    expect(second.interval).toBe(6);
  });

  it("multiplies previous interval by EF from third review on", () => {
    const s1 = schedule(initial(), 5, FIXED_NOW);
    const s2 = schedule(s1, 5, FIXED_NOW);
    const s3 = schedule(s2, 5, FIXED_NOW);
    // After two successes (1d -> 6d), third interval = round(6 * ef) ~ 16
    expect(s3.repetitions).toBe(3);
    expect(s3.interval).toBeGreaterThan(6);
  });

  it("resets repetitions on failure (q=0) and schedules for tomorrow", () => {
    const after = schedule({ ef: 2.5, interval: 6, repetitions: 2 }, 0, FIXED_NOW);
    expect(after.repetitions).toBe(0);
    expect(after.interval).toBe(1);
  });

  it("lowers EF on a hard recall (q=3)", () => {
    const after = schedule(initial(), 3, FIXED_NOW);
    expect(after.ef).toBeLessThan(SM2_INITIAL_EF);
    expect(after.ef).toBeGreaterThanOrEqual(SM2_MIN_EF);
  });

  it("clamps EF at SM2_MIN_EF on repeated failures", () => {
    let s: Sm2StateInput = initial();
    for (let i = 0; i < 10; i++) {
      s = schedule(s, 0, FIXED_NOW);
    }
    expect(s.ef).toBe(SM2_MIN_EF);
  });

  it("produces an ISO8601 dueAt string offset by interval days", () => {
    const next = schedule(initial(), 5, FIXED_NOW);
    const expected = new Date(FIXED_NOW.getTime() + 1 * 86400000).toISOString();
    expect(next.dueAt).toBe(expected);
  });

  it("recovers from pathological state (negative interval) without throwing", () => {
    const next = schedule({ ef: 2.5, interval: -5, repetitions: 3 }, 5, FIXED_NOW);
    expect(next.interval).toBeGreaterThanOrEqual(1);
  });
});

describe("readSm2State", () => {
  it("returns defaults for null / undefined", () => {
    expect(readSm2State(null)).toEqual({ ef: SM2_INITIAL_EF, interval: 0, repetitions: 0 });
    expect(readSm2State(undefined)).toEqual({ ef: SM2_INITIAL_EF, interval: 0, repetitions: 0 });
  });

  it("reads numeric fields from a jsonb blob", () => {
    expect(readSm2State({ ef: 2.1, interval: 3, repetitions: 2 })).toEqual({
      ef: 2.1,
      interval: 3,
      repetitions: 2,
    });
  });

  it("falls back to defaults for partial blobs", () => {
    expect(readSm2State({ ef: 2.0 })).toEqual({ ef: 2.0, interval: 0, repetitions: 0 });
  });
});
