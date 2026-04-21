/**
 * @jest-environment node
 */
const mockAskStructured = jest.fn();

jest.mock("../aiTutor", () => ({
  askStructured: (...args: unknown[]) => mockAskStructured(...args),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const svc = require("../flashcardService") as typeof import("../flashcardService");
/* eslint-enable @typescript-eslint/no-require-imports */

describe("generateCardsForTopic", () => {
  it("returns the AI-supplied card list, truncated to `count`", async () => {
    mockAskStructured.mockResolvedValueOnce({
      data: {
        cards: [
          { question: "q1", hint_chain: ["a"], answer_explanation: "e1", difficulty: "easy" },
          { question: "q2", hint_chain: ["b"], answer_explanation: "e2", difficulty: "medium" },
          { question: "q3", hint_chain: ["c"], answer_explanation: "e3", difficulty: "hard" },
        ],
      },
      modelUsed: "gpt-5.1",
      tokens: { input: 0, output: 0, total: 0 },
    });
    const out = await svc.generateCardsForTopic({
      studentName: "Henrique",
      subject: "Matemática",
      topicTitle: "Equações",
      count: 2,
    });
    expect(out).toHaveLength(2);
    expect(out[0].question).toBe("q1");
  });

  it("forwards mode=estudo to the AI call", async () => {
    mockAskStructured.mockResolvedValueOnce({
      data: { cards: [] },
      modelUsed: "gpt-5.1",
      tokens: { input: 0, output: 0, total: 0 },
    });
    await svc.generateCardsForTopic({
      studentName: "Ana",
      subject: "História",
      topicTitle: "Brasil Colônia",
      count: 1,
    });
    const callArg = mockAskStructured.mock.calls[mockAskStructured.mock.calls.length - 1][0];
    expect(callArg.mode).toBe("estudo");
  });
});

describe("persistGeneratedCards", () => {
  it("returns [] for an empty list without touching the DB", async () => {
    const from = jest.fn();
    const supabase = { from } as unknown as Parameters<typeof svc.persistGeneratedCards>[0];
    const out = await svc.persistGeneratedCards(supabase, {
      parentId: "p",
      childId: "c",
      topicId: "t",
      cards: [],
    });
    expect(out).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns [] on insert error", async () => {
    const supabase = {
      from: () => ({
        insert: () => ({
          select: () => Promise.resolve({ data: null, error: { message: "x" } }),
        }),
      }),
    } as unknown as Parameters<typeof svc.persistGeneratedCards>[0];
    const out = await svc.persistGeneratedCards(supabase, {
      parentId: "p",
      childId: "c",
      topicId: "t",
      cards: [
        { question: "q", hint_chain: ["h"], answer_explanation: "a", difficulty: "easy" },
      ],
    });
    expect(out).toEqual([]);
  });

  it("returns inserted rows on success", async () => {
    const inserted = [{ id: "card-a" }];
    const supabase = {
      from: () => ({
        insert: () => ({
          select: () => Promise.resolve({ data: inserted, error: null }),
        }),
      }),
    } as unknown as Parameters<typeof svc.persistGeneratedCards>[0];
    const out = await svc.persistGeneratedCards(supabase, {
      parentId: "p",
      childId: "c",
      topicId: "t",
      cards: [
        { question: "q", hint_chain: ["h"], answer_explanation: "a", difficulty: "easy" },
      ],
    });
    expect(out).toEqual(inserted);
  });
});

describe("pickNextCard", () => {
  type Supa = Parameters<typeof svc.pickNextCard>[0];

  it("returns a due card when available", async () => {
    // First query (due) resolves with a card, second never runs.
    const supabase = {
      from: () => {
        const builder: Record<string, unknown> = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn(() => Promise.resolve({ data: [{ id: "due-card" }], error: null })),
        };
        return builder;
      },
    } as unknown as Supa;
    const out = await svc.pickNextCard(supabase, { childId: "c" });
    expect(out).toEqual({ id: "due-card" });
  });

  it("falls back to a new card when no due ones exist", async () => {
    let call = 0;
    const supabase = {
      from: () => {
        call++;
        const isFirst = call === 1;
        const builder: Record<string, unknown> = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn(() =>
            Promise.resolve(isFirst ? { data: [], error: null } : { data: [{ id: "new" }], error: null })
          ),
        };
        return builder;
      },
    } as unknown as Supa;
    const out = await svc.pickNextCard(supabase, { childId: "c" });
    expect(out).toEqual({ id: "new" });
  });

  it("returns null when no cards at all (plan filter applied)", async () => {
    // pickNextCard chains `.limit(1).eq(plan_id, ...)` when planId is set,
    // then awaits the chain. The builder needs to be awaitable via `then`.
    const makeBuilder = (result: { data: unknown[]; error: unknown }) => {
      const builder: Record<string, unknown> = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve(result),
      };
      return builder;
    };
    const supabase = {
      from: () => makeBuilder({ data: [], error: null }),
    } as unknown as Supa;
    const out = await svc.pickNextCard(supabase, { childId: "c", planId: "p" });
    expect(out).toBeNull();
  });
});

describe("reviewCard", () => {
  it("returns error when the card is not found", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: { message: "not found" } }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof svc.reviewCard>[0];

    const outcome = await svc.reviewCard(supabase, {
      cardId: "00000000-0000-0000-0000-000000000000",
      quality: 5,
    });
    expect(outcome.updated).toBeNull();
    expect(outcome.error).toBeTruthy();
  });

  it("applies SM-2 scheduling on a successful read + update", async () => {
    const updated = { id: "card-1", sm2_state: { ef: 2.5, interval: 1, repetitions: 1 } };
    // One shared builder across every `from()` call — the route reads then updates,
    // so the mock returns the initial row first, then the updated row.
    const singleMock = jest
      .fn()
      .mockResolvedValueOnce({
        data: { id: "card-1", sm2_state: { ef: 2.5, interval: 0, repetitions: 0 } },
        error: null,
      })
      .mockResolvedValueOnce({ data: updated, error: null });
    const builder: Record<string, unknown> = {
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: singleMock,
    };
    const supabase = {
      from: jest.fn(() => builder),
    } as unknown as Parameters<typeof svc.reviewCard>[0];

    const outcome = await svc.reviewCard(supabase, {
      cardId: "card-1",
      quality: 5,
      now: new Date("2026-04-20T12:00:00Z"),
    });
    expect(outcome.nextSm2.repetitions).toBe(1);
    expect(outcome.nextSm2.interval).toBe(1);
    expect(outcome.updated).toEqual(updated);
  });

  it("returns an emptySm2 fallback (with due_at) when the card is missing", async () => {
    // Regression: emptySm2() used to ship without a due_at key, which meant
    // pickNextCard's `sm2_state->>due_at <= now` filter silently dropped the
    // row from the due queue. We keep asserting the key is present so any
    // future refactor of emptySm2 has to re-establish the invariant.
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: { message: "nf" } }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof svc.reviewCard>[0];

    const outcome = await svc.reviewCard(supabase, {
      cardId: "00000000-0000-0000-0000-000000000000",
      quality: 5,
    });
    expect(outcome.nextSm2.due_at).toBeDefined();
    // epoch-zero sentinel — brand-new cards are ALWAYS due.
    expect(outcome.nextSm2.due_at).toBe("1970-01-01T00:00:00.000Z");
    expect(outcome.nextSm2.repetitions).toBe(0);
    expect(outcome.nextSm2.interval).toBe(0);
  });
});

describe("persistGeneratedCards — sm2_state initial shape", () => {
  it("sets sm2_state with due_at=epoch-zero on new cards", async () => {
    // Capture the actual payload sent to supabase.insert so we can assert
    // the sm2_state field — this is the critical bit for pickNextCard to
    // treat fresh cards as immediately due.
    let capturedRows: unknown[] = [];
    const supabase = {
      from: () => ({
        insert: (rows: unknown[]) => {
          capturedRows = rows;
          return {
            select: () => Promise.resolve({ data: rows, error: null }),
          };
        },
      }),
    } as unknown as Parameters<typeof svc.persistGeneratedCards>[0];

    await svc.persistGeneratedCards(supabase, {
      parentId: "p",
      childId: "c",
      topicId: "t",
      cards: [
        { question: "q", hint_chain: ["h"], answer_explanation: "a", difficulty: "easy" },
      ],
    });

    expect(capturedRows).toHaveLength(1);
    const row = capturedRows[0] as { sm2_state: { due_at: string; repetitions: number } };
    expect(row.sm2_state).toBeDefined();
    expect(row.sm2_state.due_at).toBe("1970-01-01T00:00:00.000Z");
    expect(row.sm2_state.repetitions).toBe(0);
  });
});
