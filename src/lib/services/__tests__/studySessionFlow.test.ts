/**
 * @jest-environment node
 *
 * Covers the IO branches of studySessionService that aren't exercised by the
 * pure-function tests in studySessionService.test.ts.
 */
import {
  startSession,
  endSession,
} from "../studySessionService";

type Supa = Parameters<typeof startSession>[0];

describe("startSession", () => {
  it("returns 'session_insert_failed' when db rejects", async () => {
    const supabase = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: { message: "db fail" } }),
          }),
        }),
      }),
    } as unknown as Supa;
    const out = await startSession(supabase, {
      parentId: "p",
      childId: "c",
      mode: "estudo",
    });
    expect(out.session).toBeNull();
    expect(out.error).toBe("db fail");
  });

  it("resolves to a session on success", async () => {
    const supabase = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: "s1", mode: "estudo" }, error: null }),
          }),
        }),
      }),
    } as unknown as Supa;
    const out = await startSession(supabase, {
      parentId: "p",
      childId: "c",
      mode: "estudo",
    });
    expect(out.session?.id).toBe("s1");
    expect(out.error).toBeNull();
  });
});

describe("endSession", () => {
  function makeEndSupabase({
    readResult,
    updateResult,
  }: {
    readResult: { data: unknown; error: unknown };
    updateResult: { data: unknown; error: unknown };
  }): Supa {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({ single: () => Promise.resolve(readResult) }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve(updateResult),
            }),
          }),
        }),
      }),
    } as unknown as Supa;
  }

  it("returns 404-style error when session is not found", async () => {
    const supabase = makeEndSupabase({
      readResult: { data: null, error: { message: "not found" } },
      updateResult: { data: null, error: null },
    });
    const out = await endSession(supabase, {
      sessionId: "s1",
      inputs: {
        questionsAsked: 1,
        cardsReviewed: 1,
        cardsCorrect: 1,
        hintsUsedTotal: 0,
        hintsAvailableTotal: 1,
      },
    });
    expect(out.session).toBeNull();
    expect(out.error).toBe("not found");
  });

  it("flags focusQualified=true when session >= 15 min", async () => {
    const start = new Date("2026-04-20T00:00:00Z");
    const end = new Date(start.getTime() + 16 * 60000);
    const supabase = makeEndSupabase({
      readResult: { data: { started_at: start.toISOString() }, error: null },
      updateResult: { data: { id: "s1", ended_at: end.toISOString() }, error: null },
    });
    const out = await endSession(supabase, {
      sessionId: "s1",
      inputs: {
        questionsAsked: 5,
        cardsReviewed: 10,
        cardsCorrect: 8,
        hintsUsedTotal: 2,
        hintsAvailableTotal: 20,
      },
      now: end,
    });
    expect(out.focusQualified).toBe(true);
    expect(out.error).toBeNull();
  });

  it("returns 'session_update_failed' when the UPDATE fails", async () => {
    const start = new Date("2026-04-20T00:00:00Z");
    const end = new Date(start.getTime() + 20 * 60000);
    const supabase = makeEndSupabase({
      readResult: { data: { started_at: start.toISOString() }, error: null },
      updateResult: { data: null, error: { message: "constraint" } },
    });
    const out = await endSession(supabase, {
      sessionId: "s1",
      inputs: {
        questionsAsked: 0,
        cardsReviewed: 0,
        cardsCorrect: 0,
        hintsUsedTotal: 0,
        hintsAvailableTotal: 0,
      },
      now: end,
    });
    expect(out.error).toBe("constraint");
    expect(out.session).toBeNull();
  });
});
